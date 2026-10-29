import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import {
  BOOKING_POLICY_VERSION,
  HOLD_DURATION_MS,
} from '../booking.constants.js';
import {
  BookingConflictError,
  BookingValidationError,
  isExclusionConflictError,
} from '../domain/booking-errors.js';
import {
  SLOT_LOCK_TTL_MS,
  buildSlotLockKey,
} from '../domain/booking-slot-key.js';
import { BookingSlotLock } from '../ports/booking-slot-lock.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { invalidateCourtDayCache } from './get-court-day-occupancies.use-case.js';
import {
  BookingStore,
  type BookingDraft,
  type BookingPriceLine,
  type StoredBooking,
} from '../ports/booking-store.js';
import type { CreateHoldCommand } from './booking.commands.js';

@Injectable()
export class CreateHoldUseCase {
  private readonly logger = new Logger(CreateHoldUseCase.name);

  constructor(
    private readonly bookings: BookingStore,
    private readonly schedule: CourtScheduleReader,
    @Optional() private readonly slotLock?: BookingSlotLock,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async execute(command: CreateHoldCommand): Promise<StoredBooking> {
    // Distributed slot lock: two requests for the same court/window contend
    // on one Redis key. Denial maps to 409 so the client retries another
    // slot. The DB exclusion constraint stays the authoritative backstop.
    const lockKey = buildSlotLockKey(
      command.courtId,
      command.startsAt,
      command.endsAt,
    );
    let lease: Awaited<ReturnType<BookingSlotLock['acquire']>> | null = null;
    let lockContended = false;
    if (this.slotLock) {
      try {
        lease = await this.slotLock.acquire(lockKey, SLOT_LOCK_TTL_MS);
        // Null (not a throw) means SET NX lost the race: another request
        // holds this court/window. Fail-open adapters return a no-op lease
        // instead of null, so null always means genuine contention here.
        lockContended = lease === null;
      } catch {
        // Fail open: Redis outage must not take booking down while the
        // exclusion constraint still rejects overlapping occupancy.
        this.logger.warn(
          `Slot lock unavailable for ${lockKey}; proceeding without it.`,
        );
      }
      if (lockContended) {
        // Wait on the database idempotency lock before rejecting a contender:
        // a concurrent retry must replay the first committed request.
        return this.bookings.withTransaction(async (transaction, store) => {
          await store.lockIdempotency(
            transaction,
            command.userId,
            command.idempotencyKey,
          );
          const now = await store.databaseNow(transaction);
          const replay = await this.replay(transaction, store, command, now);
          if (replay) return replay;
          throw new BookingConflictError(
            'Sân đang được giữ bởi yêu cầu khác trong khung giờ này. Hãy thử lại.',
          );
        });
      }
    }
    try {
      const created = await this.bookings.withTransaction(
        (transaction, store) =>
          this.createInTransaction(transaction, store, command),
      );
      // Day-grid cache invalidation after commit (best-effort, fail-open).
      await invalidateCourtDayCache(this.redis, command.courtId);
      return created;
    } catch (error: unknown) {
      // Only translate the DB exclusion guard that this use case owns. Other
      // failures (including Courts' own 400/404 errors) keep flowing to the
      // presentation layer unchanged.
      if (isExclusionConflictError(error))
        throw new BookingConflictError(
          'Sân vừa được giữ trong khoảng này, kể cả thời gian vệ sinh. Hãy chọn giờ khác.',
        );
      throw error;
    } finally {
      if (lease) await lease.release();
    }
  }

  private async createInTransaction(
    transaction: TransactionContext,
    store: BookingStore,
    command: CreateHoldCommand,
  ): Promise<StoredBooking> {
    // Serialize retries of one logical request, even when their courts differ.
    // Hash collisions only cause extra waiting; the unique index is authoritative.
    await store.lockIdempotency(
      transaction,
      command.userId,
      command.idempotencyKey,
    );
    const now = await store.databaseNow(transaction);
    const replay = await this.replay(transaction, store, command, now);
    if (replay) return replay;
    await store.expireEligibleHolds(
      transaction,
      { courtId: command.courtId },
      now,
    );
    return this.insert(transaction, store, command, now);
  }

  private async replay(
    transaction: TransactionContext,
    store: BookingStore,
    command: CreateHoldCommand,
    now: Date,
  ): Promise<StoredBooking | null> {
    const existing = await store.findReplay(
      transaction,
      command.userId,
      command.idempotencyKey,
    );
    if (!existing) return null;
    const percent = command.prepaymentPercent ?? 30;
    if (
      existing.courtId !== command.courtId ||
      existing.startsAt.getTime() !== Date.parse(command.startsAt) ||
      existing.endsAt.getTime() !== Date.parse(command.endsAt) ||
      (existing.prepaymentPercent !== undefined &&
        existing.prepaymentPercent !== percent)
    )
      throw new BookingConflictError(
        'Khóa idempotency đã dùng cho thông tin đặt sân khác.',
      );
    await store.expireEligibleHolds(transaction, { id: existing.id }, now);
    return store.readBooking(transaction, existing.id);
  }

  private async insert(
    transaction: TransactionContext,
    store: BookingStore,
    command: CreateHoldCommand,
    now: Date,
  ): Promise<StoredBooking> {
    const startsAt = new Date(command.startsAt);
    const endsAt = new Date(command.endsAt);
    if (startsAt.getTime() < now.getTime() + HOLD_DURATION_MS)
      throw new BookingValidationError(
        'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.',
      );
    if (
      command.prepaymentPercent !== undefined &&
      command.prepaymentPercent !== 30
    ) {
      throw new BookingValidationError('Tỷ lệ đặt cọc bắt buộc là 30%.');
    }
    const court = await this.schedule.getActiveSchedule(
      command.courtId,
      transaction,
    );
    const quote = this.schedule.quote(court, startsAt, endsAt);
    const customer = await store.loadCustomer(transaction, command.userId);
    // Mandatory 30% deposit policy on court rental price for all users:
    const percent = 30;
    const required = Math.floor((quote.totalAmount * 30 + 50) / 100);
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
      idempotencyKey: command.idempotencyKey,
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
