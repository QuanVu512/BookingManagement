import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import {
  BOOKING_POLICY_VERSION,
  HOLD_DURATION_MS,
} from '../../bookings/booking.constants.js';
import { isExclusionConflictError } from '../../bookings/domain/booking-errors.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import { prepaymentAmountFor } from '../domain/money.js';

export interface GuestCreateHoldInput {
  courtId: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  prepaymentPercent?: number;
  idempotencyKey: string;
}

export interface GuestHoldResult {
  bookingId: string;
  bookingCode: string;
  holdExpiresAt: string;
  totalAmount: number;
  prepaymentAmount: number;
  accessToken: string;
  accessTokenExpiresAt: string;
  serverNow: string;
}

/**
 * E3 — Guest hold 30% deposit + token MANAGE_BOOKING.
 * - Public; mandatory 30% deposit on court rental price for all bookings.
 * - Token SHA-256 hash ở DB, raw trả một lần; không revoke khi cancel.
 */
@Injectable()
export class GuestCreateHoldUseCase {
  private readonly logger = new Logger(GuestCreateHoldUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: CourtScheduleReader,
    private readonly config: ConfigService,
  ) {}

  private tokenTtlDays(): number {
    const raw = Number(this.config.get<string>('GUEST_MANAGE_TOKEN_TTL_DAYS') ?? '30');
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 90) : 30;
  }

  async execute(input: GuestCreateHoldInput): Promise<GuestHoldResult> {
    const percent = input.prepaymentPercent ?? 30;
    if (percent !== 30) {
      throw new BadRequestException({
        code: 'GUEST_PREPAYMENT_30_ONLY',
        message: 'Khách vãng lai bắt buộc thanh toán đặt cọc 30%.',
      });
    }
    try {
      return await this.prisma.$transaction(
        (transaction) => this.createInTransaction(transaction, input),
        PAYMENT_TRANSACTION_OPTIONS,
      );
    } catch (error: unknown) {
      if (isExclusionConflictError(error)) {
        throw new ConflictException('Khung giờ vừa được giữ. Hãy chọn giờ khác.');
      }
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Guest hold transaction unavailable.');
      throw new ServiceUnavailableException(
        'Chưa tạo được giữ chỗ. Hãy thử lại cùng khóa idempotency.',
      );
    }
  }

  private async createInTransaction(
    transaction: TransactionContext,
    input: GuestCreateHoldInput,
  ): Promise<GuestHoldResult> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('guest-hold'), hashtext(${input.idempotencyKey}))`;
    const [clock] = await transaction.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    const now = clock.now;

    const replay = await transaction.booking.findFirst({
      where: { userId: null, idempotencyKey: input.idempotencyKey },
    });
    if (replay) {
      if (
        replay.courtId !== input.courtId ||
        replay.startsAt.getTime() !== Date.parse(input.startsAt) ||
        replay.endsAt.getTime() !== Date.parse(input.endsAt)
      ) {
        throw new BadRequestException({
          code: 'PAYMENT_IDEMPOTENCY_CONFLICT',
          message: 'Khóa idempotency đã dùng cho thông tin đặt sân khác.',
        });
      }
      // Replay an toàn: KHÔNG trả lại raw token; holder thật đã nhận ở lần
      // tạo. Mất token → staff recovery (E13) sau xác minh claimant.
      return this.present(replay, null, null, now);
    }

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (startsAt.getTime() < now.getTime() + HOLD_DURATION_MS) {
      throw new BadRequestException('Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.');
    }
    const court = await this.schedule.getActiveSchedule(input.courtId, transaction);
    const quote = this.schedule.quote(court, startsAt, endsAt);
    const total = quote.totalAmount;
    const required = prepaymentAmountFor(total, 30);
    const bookingCode = `BK-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
    const holdExpiresAt = new Date(now.getTime() + HOLD_DURATION_MS);

    const booking = await transaction.booking.create({
      data: {
        bookingCode,
        userId: null,
        courtId: court.id,
        branchId: court.branchId,
        source: 'CUSTOMER_WEB',
        customerName: input.customerName,
        customerEmail: input.customerEmail,
        customerPhone: input.customerPhone,
        startsAt,
        endsAt,
        cleanupMinutes: court.cleanupMinutes,
        totalAmount: total,
        prepaymentPercent: 30,
        requiredPrepaymentAmount: required,
        status: 'HOLDING',
        holdExpiresAt,
        cancellationRule: 'BEFORE_START',
        cancellationDeadlineAt: startsAt,
        policyVersion: BOOKING_POLICY_VERSION,
        policyAcceptedAt: now,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (quote.items.length) {
      await transaction.bookingPriceItem.createMany({
        data: quote.items.map((item) => ({ ...item, bookingId: booking.id })),
      });
    }
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        toStatus: 'HOLDING',
        actorType: 'GUEST',
      },
    });
    await transaction.courtOccupancy.create({
      data: {
        bookingId: booking.id,
        courtId: booking.courtId,
        kind: 'BOOKING',
        occupiedFrom: booking.startsAt,
        occupiedUntil: new Date(
          booking.endsAt.getTime() + booking.cleanupMinutes * 60_000,
        ),
      },
    });

    // Token phát hành CÙNG tx với booking: raw trả một lần duy nhất ở đây.
    const rawToken = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(
      Math.max(startsAt.getTime(), now.getTime()) +
        this.tokenTtlDays() * 86_400_000,
    );
    await transaction.bookingAccessToken.create({
      data: {
        bookingId: booking.id,
        purpose: 'MANAGE_BOOKING',
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: tokenExpiresAt,
      },
    });
    return this.present(booking, rawToken, tokenExpiresAt, now);
  }

  private present(
    booking: {
      id: string;
      bookingCode: string;
      holdExpiresAt: Date;
      totalAmount: { toString(): string } | number;
      requiredPrepaymentAmount?: { toString(): string } | number;
    },
    rawToken: string | null,
    tokenExpiresAt: Date | null,
    now: Date,
  ): GuestHoldResult {
    const totalAmount = Number(booking.totalAmount.toString());
    const prepaymentAmount = booking.requiredPrepaymentAmount != null
      ? Number(booking.requiredPrepaymentAmount.toString())
      : Math.floor((totalAmount * 30 + 50) / 100);
    return {
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      holdExpiresAt: booking.holdExpiresAt.toISOString(),
      totalAmount,
      prepaymentAmount,
      accessToken: rawToken ?? '',
      accessTokenExpiresAt: tokenExpiresAt ? tokenExpiresAt.toISOString() : '',
      serverNow: now.toISOString(),
    };
  }
}
