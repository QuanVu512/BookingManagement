import { Injectable } from '@nestjs/common';
import { MAX_BOOKING_EXPIRY_BATCHES_PER_RUN } from '../booking.constants.js';
import { BookingStore } from '../ports/booking-store.js';

/**
 * Background reconciliation for expired holds. Each batch is its own
 * transaction and the conditional update makes concurrent workers safe: a row
 * is transitioned at most once, and a second worker simply transition zero.
 */
@Injectable()
export class ExpireEligibleHoldsUseCase {
  constructor(private readonly bookings: BookingStore) {}

  async execute(batchSize: number): Promise<number> {
    if (!Number.isInteger(batchSize) || batchSize < 1)
      throw new Error('batchSize must be a positive integer.');

    let transitioned = 0;
    for (let run = 0; run < MAX_BOOKING_EXPIRY_BATCHES_PER_RUN; run += 1) {
      const count = await this.bookings.withTransaction(
        async (transaction, store) => {
          const now = await store.databaseNow(transaction);
          return store.expireEligibleHolds(transaction, {}, now, batchSize);
        },
      );
      transitioned += count;
      if (count < batchSize) break;
    }
    return transitioned;
  }
}
