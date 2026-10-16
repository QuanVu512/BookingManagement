import { Prisma } from '../../generated/prisma/client.js';

export const bookingInclude = {
  court: { select: { name: true } },
  branch: { select: { timezone: true } },
  priceItems: { orderBy: { startsAt: 'asc' } },
} satisfies Prisma.BookingInclude;

export function presentBooking(
  booking: Prisma.BookingGetPayload<{ include: typeof bookingInclude }>,
) {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    courtId: booking.courtId,
    courtName: booking.court.name,
    timezone: booking.branch.timezone,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    holdExpiresAt: booking.holdExpiresAt.toISOString(),
    status: booking.status,
    totalAmount: booking.totalAmount.toNumber(),
    currency: booking.currency,
    priceItems: booking.priceItems.map((item) => ({
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      durationMinutes: item.durationMinutes,
      pricePerHour: item.pricePerHour.toNumber(),
      amount: item.amount.toNumber(),
    })),
  };
}
