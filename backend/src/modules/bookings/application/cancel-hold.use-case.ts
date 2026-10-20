import { Injectable } from '@nestjs/common';
import {
  BookingConflictError,
  BookingNotFoundError,
} from '../domain/booking-errors.js';
import {
  BookingStore,
  type CancellationTarget,
  type StoredBooking,
} from '../ports/booking-store.js';
import type { CancelHoldCommand } from './booking.commands.js';

@Injectable()
export class CancelHoldUseCase {
  constructor(private readonly bookings: BookingStore) {}

  execute(command: CancelHoldCommand): Promise<StoredBooking> {
    return this.bookings.withTransaction(async (transaction, store) => {
      const lookup = await store.loadCancellationLookup(
        transaction,
        command.bookingId,
        command.userId,
      );
      if (!lookup) throw new BookingNotFoundError('Không tìm thấy booking.');
      const { booking, now } = lookup;
      if (isFinalHoldStatus(booking.status))
        return store.readBooking(transaction, command.bookingId);
      assertCancellable(booking, now);
      const changed = await store.markCancelled(
        transaction,
        command.bookingId,
        command.userId,
        booking.version,
        now,
      );
      if (!changed)
        throw new BookingConflictError(
          'Trạng thái booking đã thay đổi. Hãy tải lại.',
        );
      await store.releaseCancelled(
        transaction,
        command.bookingId,
        command.userId,
        now,
      );
      return store.readBooking(transaction, command.bookingId);
    });
  }
}

function isFinalHoldStatus(status: string) {
  return status === 'EXPIRED' || status === 'CANCELLED';
}

function assertCancellable(booking: CancellationTarget, now: Date) {
  if (
    booking.status !== 'HOLDING' ||
    booking.startsAt <= now ||
    booking.hasCheckin
  )
    throw new BookingConflictError(
      'Chỉ hủy giữ chỗ chưa check-in và chưa đến giờ bắt đầu.',
    );
}
