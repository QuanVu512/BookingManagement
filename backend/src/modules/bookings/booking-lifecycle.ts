import { Prisma } from '../../generated/prisma/client.js';

// Conditional update owns the transition. Concurrent readers/cancellations cannot
// add a second history entry or release a newly created occupancy.
export async function expireHolds(
  transaction: Prisma.TransactionClient,
  where: Prisma.BookingWhereInput,
  now: Date,
) {
  const expired = await transaction.booking.findMany({
    where: { ...where, status: 'HOLDING', holdExpiresAt: { lte: now } },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  for (const booking of expired) {
    const changed = await transaction.booking.updateMany({
      where: { id: booking.id, status: 'HOLDING', holdExpiresAt: { lte: now } },
      data: { status: 'EXPIRED', version: { increment: 1 } },
    });
    if (!changed.count) continue;
    await transaction.courtOccupancy.updateMany({
      where: { bookingId: booking.id, state: 'ACTIVE' },
      data: { state: 'RELEASED', releasedAt: now },
    });
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        fromStatus: 'HOLDING',
        toStatus: 'EXPIRED',
        actorType: 'SYSTEM',
        reason: 'Hết hạn giữ chỗ 5 phút.',
      },
    });
  }
}

export async function databaseNow(transaction: Prisma.TransactionClient) {
  const [clock] = await transaction.$queryRaw<
    { now: Date }[]
  >`SELECT clock_timestamp() AS now`;
  return clock.now;
}
