import type { StoredBooking } from '../ports/booking-store.js';
import type { AvailabilityView } from '../application/quote-availability.use-case.js';

export function presentBooking(booking: StoredBooking) {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    courtId: booking.courtId,
    courtName: booking.courtName,
    timezone: booking.timezone,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    holdExpiresAt: booking.holdExpiresAt.toISOString(),
    status: booking.status,
    totalAmount: booking.totalAmount,
    // E2 superset (parser-compatible): snapshot trả trước từ server.
    prepaymentPercent: booking.prepaymentPercent,
    requiredPrepaymentAmount: booking.requiredPrepaymentAmount,
    prepaymentAmount: booking.requiredPrepaymentAmount,
    balanceAmount: Math.max(
      booking.totalAmount - booking.requiredPrepaymentAmount,
      0,
    ),
    currency: booking.currency,
    priceItems: booking.priceItems.map((item) => ({
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      durationMinutes: item.durationMinutes,
      pricePerHour: item.pricePerHour,
      amount: item.amount,
    })),
  };
}

export function presentAvailability(availability: AvailabilityView) {
  return {
    available: availability.available,
    reason: availability.reason,
    serverNow: availability.serverNow.toISOString(),
    timezone: availability.timezone,
    cleanupMinutes: availability.cleanupMinutes,
    occupiedUntil: availability.occupiedUntil.toISOString(),
    totalAmount: availability.totalAmount,
    currency: availability.currency,
    priceItems: availability.priceItems.map((item) => ({
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      durationMinutes: item.durationMinutes,
      pricePerHour: item.pricePerHour,
      amount: item.amount,
    })),
  };
}
