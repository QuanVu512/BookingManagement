import { Injectable } from '@nestjs/common';
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
  BookingStore,
  type BookingDraft,
  type BookingPriceLine,
  type StoredBooking,
} from '../ports/booking-store.js';
import type { CreateHoldCommand } from './booking.commands.js';

@Injectable()
export class CreateHoldUseCase {
  constructor(
    private readonly bookings: BookingStore,
    private readonly schedule: CourtScheduleReader,
  ) {}

  async execute(command: CreateHoldCommand): Promise<StoredBooking> {
    try {
      return await this.bookings.withTransaction((transaction, store) =>
        this.createInTransaction(transaction, store, command),
      );
    } catch (error: unknown) {
      // Only translate the DB exclusion guard that this use case owns. Other
      // failures (including Courts' own 400/404 errors) keep flowing to the
      // presentation layer unchanged.
      if (isExclusionConflictError(error))
        throw new BookingConflictError(
          'Sân vừa được giữ trong khoảng này, kể cả thời gian vệ sinh. Hãy chọn giờ khác.',
        );
      throw error;
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
    if (
      existing.courtId !== command.courtId ||
      existing.startsAt.getTime() !== Date.parse(command.startsAt) ||
      existing.endsAt.getTime() !== Date.parse(command.endsAt)
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
    const court = await this.schedule.getActiveSchedule(
      command.courtId,
      transaction,
    );
    const quote = this.schedule.quote(court, startsAt, endsAt);
    const customer = await store.loadCustomer(transaction, command.userId);
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
      requiredPrepaymentAmount: quote.totalAmount,
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
