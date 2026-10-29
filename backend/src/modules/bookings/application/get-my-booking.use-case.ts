import { Injectable } from '@nestjs/common';
import type { Role } from '../../../enums/index.js';
import { BookingNotFoundError } from '../domain/booking-errors.js';
import { assertBookingOwnership } from '../domain/booking-ownership.js';
import {
  BookingStore,
  type StoredBooking,
} from '../ports/booking-store.js';

export interface GetMyBookingQuery {
  bookingId: string;
  /** JWT subject — never taken from body/query. */
  requesterUserId: string;
  requesterRoles?: Role[];
}

/**
 * Single-booking read with ownership enforcement. Non-owners (and unknown
 * ids) get `BookingNotFoundError` → HTTP 404, so ids cannot be probed.
 * STAFF+ bypass for counter support via the shared ownership policy.
 */
@Injectable()
export class GetMyBookingUseCase {
  constructor(private readonly bookings: BookingStore) {}

  execute(query: GetMyBookingQuery): Promise<StoredBooking> {
    return this.bookings.withTransaction(async (transaction, store) => {
      const owner = await store.loadBookingOwner(
        transaction,
        query.bookingId,
      );
      if (owner === undefined)
        throw new BookingNotFoundError('Không tìm thấy booking.');
      assertBookingOwnership({
        ownerUserId: owner,
        requesterUserId: query.requesterUserId,
        requesterRoles: query.requesterRoles,
      });
      const now = await store.databaseNow(transaction);
      await store.expireEligibleHolds(transaction, { id: query.bookingId }, now);
      return store.readBooking(transaction, query.bookingId);
    });
  }
}
