import { Injectable } from '@nestjs/common';
import { BookingStore, type BookingPage } from '../ports/booking-store.js';

@Injectable()
export class ListMyBookingsUseCase {
  constructor(private readonly bookings: BookingStore) {}

  execute(userId: string, cursor?: string): Promise<BookingPage> {
    return this.bookings.withTransaction(async (transaction, store) => {
      const now = await store.databaseNow(transaction);
      await store.expireEligibleHolds(transaction, { userId }, now);
      return store.loadMine(transaction, userId, cursor);
    });
  }
}
