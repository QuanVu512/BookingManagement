import type { Booking, Prisma } from '../../generated/prisma/client.js';
import type { quoteCourt } from '../courts/court-pricing.js';
import { MINUTE_MS } from './booking.constants.js';

export async function persistBookingDetails(
  transaction: Prisma.TransactionClient,
  booking: Booking,
  items: ReturnType<typeof quoteCourt>['items'],
) {
  await transaction.bookingPriceItem.createMany({
    data: items.map((item) => ({ ...item, bookingId: booking.id })),
  });
  await transaction.bookingStatusHistory.create({
    data: {
      bookingId: booking.id,
      toStatus: 'HOLDING',
      actorType: 'CUSTOMER',
      actorUserId: booking.userId,
    },
  });
  await transaction.courtOccupancy.create({
    data: {
      bookingId: booking.id,
      courtId: booking.courtId,
      kind: 'BOOKING',
      occupiedFrom: booking.startsAt,
      occupiedUntil: new Date(
        booking.endsAt.getTime() + booking.cleanupMinutes * MINUTE_MS,
      ),
    },
  });
}

export async function markCancelled(
  transaction: Prisma.TransactionClient,
  id: string,
  userId: string,
  version: number,
  now: Date,
) {
  return transaction.booking.updateMany({
    where: { id, userId, status: 'HOLDING', version },
    data: {
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledByUserId: userId,
      version: { increment: 1 },
    },
  });
}
