import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';

export interface ExpiryScope {
  courtId?: string;
  userId?: string;
  id?: string;
}

export interface CustomerSnapshot {
  id: string;
  username: string;
  email: string;
  phone: string;
  fullName: string | null;
}

export interface BookingPriceLine {
  priceRuleId: string | null;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  pricePerHour: number;
  amount: number;
}

export interface BookingDraft {
  bookingCode: string;
  userId: string;
  courtId: string;
  branchId: string;
  cleanupMinutes: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startsAt: Date;
  endsAt: Date;
  totalAmount: number;
  requiredPrepaymentAmount: number;
  prepaymentPercent: number;
  holdExpiresAt: Date;
  cancellationDeadlineAt: Date;
  policyAcceptedAt: Date;
  policyVersion: string;
  createdAt: Date;
  idempotencyKey: string;
}

export interface StoredBooking {
  id: string;
  bookingCode: string;
  courtId: string;
  courtName: string;
  timezone: string;
  startsAt: Date;
  endsAt: Date;
  holdExpiresAt: Date;
  status: string;
  totalAmount: number;
  prepaymentPercent: number;
  requiredPrepaymentAmount: number;
  currency: string;
  priceItems: BookingPriceLine[];
}

export interface ReplayBooking {
  id: string;
  courtId: string;
  startsAt: Date;
  endsAt: Date;
  prepaymentPercent?: number;
}

export interface CancellationTarget {
  status: string;
  version: number;
  startsAt: Date;
  hasCheckin: boolean;
}

export interface CancellationLookup {
  booking: CancellationTarget;
  now: Date;
}

export interface BookingPage {
  bookings: StoredBooking[];
  nextCursor: string | null;
}

/**
 * Booking aggregate persistence port. It owns transaction boundaries and only
 * exposes operations the Booking use cases actually need.
 */
export abstract class BookingStore {
  abstract withTransaction<Result>(
    work: (
      transaction: TransactionContext,
      store: BookingStore,
    ) => Promise<Result>,
  ): Promise<Result>;

  abstract lockIdempotency(
    transaction: TransactionContext,
    userId: string,
    idempotencyKey: string,
  ): Promise<void>;

  abstract databaseNow(transaction: TransactionContext): Promise<Date>;

  abstract findReplay(
    transaction: TransactionContext,
    userId: string,
    idempotencyKey: string,
  ): Promise<ReplayBooking | null>;

  /**
   * Conditionally transitions expired HOLDING bookings and releases their
   * occupancy. Returns how many bookings this call actually transitioned.
   */
  abstract expireEligibleHolds(
    transaction: TransactionContext,
    scope: ExpiryScope,
    now: Date,
    limit?: number,
  ): Promise<number>;

  abstract loadCustomer(
    transaction: TransactionContext,
    userId: string,
  ): Promise<CustomerSnapshot>;

  abstract createHoldAggregate(
    transaction: TransactionContext,
    draft: BookingDraft,
    priceLines: BookingPriceLine[],
  ): Promise<string>;

  abstract loadMine(
    transaction: TransactionContext,
    userId: string,
    cursor?: string,
  ): Promise<BookingPage>;

  abstract loadCancellationLookup(
    transaction: TransactionContext,
    bookingId: string,
    userId: string,
  ): Promise<CancellationLookup | null>;

  abstract markCancelled(
    transaction: TransactionContext,
    bookingId: string,
    userId: string,
    version: number,
    now: Date,
  ): Promise<number>;

  abstract releaseCancelled(
    transaction: TransactionContext,
    bookingId: string,
    userId: string,
    now: Date,
  ): Promise<void>;

  abstract readBooking(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<StoredBooking>;

  /**
   * Read-only conflict check. An ACTIVE occupancy whose booking is a HOLDING
   * past its holdExpiresAt no longer blocks a new window, even before the
   * background worker has persisted the expiry.
   */
  abstract hasEffectiveOccupancyConflict(
    transaction: TransactionContext,
    courtId: string,
    startsAt: Date,
    occupiedUntil: Date,
    now: Date,
  ): Promise<boolean>;
}
