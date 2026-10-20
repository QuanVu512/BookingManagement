import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import {
  BOOKING_POLICY_VERSION,
  HOLD_DURATION_MS,
} from '../booking.constants.js';
import { isExclusionConflictError } from '../booking-errors.js';
import type { CreateBookingDto } from '../presentation/dto/booking-request.dto.js';
import {
  BookingStore,
  type BookingDraft,
  type BookingPriceLine,
  type StoredBooking,
} from '../ports/booking-store.js';

@Injectable()
export class CreateHoldUseCase {
  private readonly logger = new Logger(CreateHoldUseCase.name);

  constructor(
    private readonly bookings: BookingStore,
    private readonly schedule: CourtScheduleReader,
  ) {}

  async execute(
    userId: string,
    input: CreateBookingDto,
  ): Promise<StoredBooking> {
    try {
      return await this.bookings.withTransaction((transaction, store) =>
        this.createInTransaction(transaction, store, userId, input),
      );
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

  private async createInTransaction(
    transaction: TransactionContext,
    store: BookingStore,
    userId: string,
    input: CreateBookingDto,
  ): Promise<StoredBooking> {
    // Serialize retries of one logical request, even when their courts differ.
    // Hash collisions only cause extra waiting; the unique index is authoritative.
    await store.lockIdempotency(transaction, userId, input.idempotencyKey);
    const now = await store.databaseNow(transaction);
    const replay = await this.replay(transaction, store, userId, input, now);
    if (replay) return replay;
    await store.expireEligibleHolds(
      transaction,
      { courtId: input.courtId },
      now,
    );
    return this.insert(transaction, store, userId, input, now);
  }

  private async replay(
    transaction: TransactionContext,
    store: BookingStore,
    userId: string,
    input: CreateBookingDto,
    now: Date,
  ): Promise<StoredBooking | null> {
    const existing = await store.findReplay(
      transaction,
      userId,
      input.idempotencyKey,
    );
    if (!existing) return null;
    const percent = input.prepaymentPercent ?? 100;
    if (
      existing.courtId !== input.courtId ||
      existing.startsAt.getTime() !== Date.parse(input.startsAt) ||
      existing.endsAt.getTime() !== Date.parse(input.endsAt) ||
      (existing.prepaymentPercent !== undefined &&
        existing.prepaymentPercent !== percent)
    )
      throw new ConflictException(
        'Khóa idempotency đã dùng cho thông tin đặt sân khác.',
      );
    await store.expireEligibleHolds(transaction, { id: existing.id }, now);
    return store.readBooking(transaction, existing.id);
  }

  private async insert(
    transaction: TransactionContext,
    store: BookingStore,
    userId: string,
    input: CreateBookingDto,
    now: Date,
  ): Promise<StoredBooking> {
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt.getTime() < now.getTime() + HOLD_DURATION_MS)
      throw new BadRequestException(
        'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.',
      );
    const court = await this.schedule.getActiveSchedule(
      input.courtId,
      transaction,
    );
    const quote = this.schedule.quote(court, startsAt, endsAt);
    const customer = await store.loadCustomer(transaction, userId);
    // E2: snapshot immutable percent; thiếu → default 100 (rollout MIG-10);
    // required = half-up 30% hoặc toàn phần, tính từ tổng server.
    const percent = input.prepaymentPercent ?? 100;
    const required =
      percent === 30
        ? Math.floor((quote.totalAmount * 30 + 50) / 100)
        : quote.totalAmount;
    const draft: BookingDraft = {
      bookingCode: `BK-${randomUUID().replaceAll('-', '').slice(0, 24)}`,
      userId: customer.id,
      courtId: court.id,
      branchId: court.branchId,
      cleanupMinutes: court.cleanupMinutes,
      customerName: customer.fullName ?? customer.username,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      startsAt,
      endsAt,
      totalAmount: quote.totalAmount,
      prepaymentPercent: percent,
      requiredPrepaymentAmount: required,
      holdExpiresAt: new Date(now.getTime() + HOLD_DURATION_MS),
      cancellationDeadlineAt: startsAt,
      policyAcceptedAt: now,
      policyVersion: BOOKING_POLICY_VERSION,
      createdAt: now,
      idempotencyKey: input.idempotencyKey,
    };
    const priceLines: BookingPriceLine[] = quote.items;
    const bookingId = await store.createHoldAggregate(
      transaction,
      draft,
      priceLines,
    );
    return store.readBooking(transaction, bookingId);
  }
}
