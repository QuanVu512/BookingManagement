import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BookingStore,
  type CancellationTarget,
  type StoredBooking,
} from '../ports/booking-store.js';

@Injectable()
export class CancelHoldUseCase {
  constructor(private readonly bookings: BookingStore) {}

  execute(userId: string, bookingId: string): Promise<StoredBooking> {
    return this.bookings.withTransaction(async (transaction, store) => {
      const lookup = await store.loadCancellationLookup(
        transaction,
        bookingId,
        userId,
      );
      if (!lookup) throw new NotFoundException('Không tìm thấy booking.');
      const { booking, now } = lookup;
      if (isFinalHoldStatus(booking.status))
        return store.readBooking(transaction, bookingId);
      assertCancellable(booking, now);
      const changed = await store.markCancelled(
        transaction,
        bookingId,
        userId,
        booking.version,
        now,
      );
      if (!changed)
        throw new ConflictException(
          'Trạng thái booking đã thay đổi. Hãy tải lại.',
        );
      await store.releaseCancelled(transaction, bookingId, userId, now);
      return store.readBooking(transaction, bookingId);
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
    throw new ConflictException(
      'Chỉ hủy giữ chỗ chưa check-in và chưa đến giờ bắt đầu.',
    );
}
