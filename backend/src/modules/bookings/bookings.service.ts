import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { CourtsService } from '../courts/courts.service.js';
import { quoteCourt } from '../courts/court-pricing.js';
import { CreateBookingDto } from './dto/booking-request.dto.js';
import {
  BOOKING_POLICY_VERSION,
  BOOKING_TRANSACTION_OPTIONS,
  HOLD_DURATION_MS,
  MAX_BOOKINGS_PER_PAGE,
} from './booking.constants.js';
import { databaseNow, expireHolds } from './booking-lifecycle.js';
import { bookingInclude, presentBooking } from './booking-response.js';
import { isExclusionConflictError } from './booking-errors.js';
import { persistBookingDetails, markCancelled } from './booking-writer.js';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly courts: CourtsService,
  ) {}

  async create(userId: string, input: CreateBookingDto) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        // Serialize retries of one logical request, even when their courts differ.
        // Hash collisions only cause extra waiting; the unique index is authoritative.
        await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${input.idempotencyKey}))`;
        const now = await databaseNow(transaction);
        const existing = await this.retry(transaction, userId, input, now);
        if (existing) return existing;
        await expireHolds(transaction, { courtId: input.courtId }, now);
        return this.insert(transaction, userId, input, now);
      }, BOOKING_TRANSACTION_OPTIONS);
    } catch (error: unknown) {
      if (isExclusionConflictError(error))
        throw new ConflictException(
          'Sân vừa được giữ trong khoảng này, kể cả thời gian vệ sinh. Hãy chọn giờ khác.',
        );
      if (error instanceof HttpException) throw error;
      this.logger.error('Booking transaction unavailable.');
      throw new ServiceUnavailableException(
        'Chưa xử lý được giữ chỗ. Hãy thử lại cùng khóa idempotency.',
      );
    }
  }

  private async retry(
    transaction: Prisma.TransactionClient,
    userId: string,
    input: CreateBookingDto,
    now: Date,
  ) {
    const existing = await transaction.booking.findUnique({
      where: {
        userId_idempotencyKey: { userId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (!existing) return null;
    if (
      existing.courtId !== input.courtId ||
      existing.startsAt.getTime() !== Date.parse(input.startsAt) ||
      existing.endsAt.getTime() !== Date.parse(input.endsAt)
    )
      throw new ConflictException(
        'Khóa idempotency đã dùng cho thông tin đặt sân khác.',
      );
    await expireHolds(transaction, { id: existing.id }, now);
    return presentBooking(
      await transaction.booking.findUniqueOrThrow({
        where: { id: existing.id },
        include: bookingInclude,
      }),
    );
  }

  private async insert(
    transaction: Prisma.TransactionClient,
    userId: string,
    input: CreateBookingDto,
    now: Date,
  ) {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt.getTime() < now.getTime() + HOLD_DURATION_MS)
      throw new BadRequestException(
        'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.',
      );
    const court = await this.courts.activeCourt(input.courtId, transaction);
    const quote = quoteCourt(court, startsAt, endsAt);
    const customer = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    const booking = await transaction.booking.create({
      data: {
        ...this.snapshot(input, now, court, customer),
        startsAt,
        endsAt,
        totalAmount: quote.totalAmount,
        requiredPrepaymentAmount: quote.totalAmount,
      },
    });
    await persistBookingDetails(transaction, booking, quote.items);
    return this.read(transaction, booking.id);
  }

  private snapshot(
    input: CreateBookingDto,
    now: Date,
    court: { id: string; branchId: string; cleanupMinutes: number },
    customer: {
      id: string;
      username: string;
      email: string;
      phone: string;
      profile: { fullName: string } | null;
    },
  ) {
    return {
      bookingCode: `BK-${randomUUID().replaceAll('-', '').slice(0, 24)}`,
      userId: customer.id,
      courtId: court.id,
      branchId: court.branchId,
      source: 'CUSTOMER_WEB',
      status: 'HOLDING',
      cleanupMinutes: court.cleanupMinutes,
      customerName: customer.profile?.fullName ?? customer.username,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      prepaymentPercent: 100,
      holdExpiresAt: new Date(now.getTime() + HOLD_DURATION_MS),
      cancellationRule: 'BEFORE_START',
      cancellationDeadlineAt: new Date(input.startsAt),
      policyVersion: BOOKING_POLICY_VERSION,
      policyAcceptedAt: now,
      createdAt: now,
      idempotencyKey: input.idempotencyKey,
    } satisfies Partial<Prisma.BookingUncheckedCreateInput>;
  }

  async mine(userId: string, cursor?: string) {
    return this.prisma.$transaction(async (transaction) => {
      await expireHolds(
        transaction,
        { userId },
        await databaseNow(transaction),
      );
      const bookings = await transaction.booking.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: MAX_BOOKINGS_PER_PAGE + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: bookingInclude,
      });
      const hasMore = bookings.length > MAX_BOOKINGS_PER_PAGE;
      const page = bookings.slice(0, MAX_BOOKINGS_PER_PAGE);
      return {
        data: page.map(presentBooking),
        nextCursor: hasMore ? page.at(-1)?.id : null,
      };
    }, BOOKING_TRANSACTION_OPTIONS);
  }

  async cancel(userId: string, id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const { booking, now } = await this.cancellationTarget(
        transaction,
        id,
        userId,
      );
      if (['EXPIRED', 'CANCELLED'].includes(booking.status))
        return this.read(transaction, id);
      assertCancellable(booking, now);
      const changed = await markCancelled(
        transaction,
        id,
        userId,
        booking.version,
        now,
      );
      if (!changed.count)
        throw new ConflictException(
          'Trạng thái booking đã thay đổi. Hãy tải lại.',
        );
      await this.releaseCancelled(transaction, id, userId, now);
      return this.read(transaction, id);
    }, BOOKING_TRANSACTION_OPTIONS);
  }

  private async cancellationTarget(
    transaction: Prisma.TransactionClient,
    id: string,
    userId: string,
  ) {
    const owned = await transaction.booking.findFirst({
      where: { id, userId },
    });
    if (!owned) throw new NotFoundException('Không tìm thấy booking.');
    const now = await databaseNow(transaction);
    await expireHolds(transaction, { id }, now);
    const booking = await transaction.booking.findUniqueOrThrow({
      where: { id },
      include: { checkin: true },
    });
    return { booking, now };
  }

  private async releaseCancelled(
    transaction: Prisma.TransactionClient,
    id: string,
    userId: string,
    now: Date,
  ) {
    await transaction.courtOccupancy.updateMany({
      where: { bookingId: id, state: 'ACTIVE' },
      data: { state: 'RELEASED', releasedAt: now },
    });
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: id,
        fromStatus: 'HOLDING',
        toStatus: 'CANCELLED',
        actorType: 'CUSTOMER',
        actorUserId: userId,
      },
    });
  }

  private async read(transaction: Prisma.TransactionClient, id: string) {
    return presentBooking(
      await transaction.booking.findUniqueOrThrow({
        where: { id },
        include: bookingInclude,
      }),
    );
  }
}

function assertCancellable(
  booking: { status: string; startsAt: Date; checkin: unknown },
  now: Date,
) {
  if (
    booking.status !== 'HOLDING' ||
    booking.startsAt <= now ||
    booking.checkin
  )
    throw new ConflictException(
      'Chỉ hủy giữ chỗ chưa check-in và chưa đến giờ bắt đầu.',
    );
}
