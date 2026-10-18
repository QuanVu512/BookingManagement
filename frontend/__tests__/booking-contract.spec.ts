import { describe, expect, it } from '@jest/globals';
import {
  isAvailability,
  isBooking,
  parseBookingPage,
} from '../features/booking/api/booking-contract.js';

const priceItem = {
  startsAt: '2035-01-08T01:00:00Z',
  endsAt: '2035-01-08T02:00:00Z',
  durationMinutes: 60,
  pricePerHour: 100001,
  amount: 100001,
};
const booking = {
  id: 'booking',
  bookingCode: 'BK-test',
  courtId: 'court',
  courtName: 'Court',
  timezone: 'Asia/Ho_Chi_Minh',
  startsAt: priceItem.startsAt,
  endsAt: priceItem.endsAt,
  holdExpiresAt: '2035-01-08T00:05:00Z',
  status: 'HOLDING',
  totalAmount: 100001,
  currency: 'VND',
  priceItems: [priceItem],
};

describe('Booking response contract boundary', () => {
  it('accepts a complete booking page', () => {
    expect(isBooking(booking)).toBe(true);
    expect(parseBookingPage({ data: [booking], nextCursor: null })).toEqual({
      data: [booking],
      nextCursor: null,
    });
  });

  it('rejects incomplete success payloads instead of presenting them', () => {
    expect(isBooking({ id: 'incomplete' })).toBe(false);
    expect(() =>
      parseBookingPage({ data: [{ id: 'incomplete' }], nextCursor: null }),
    ).toThrow('Danh sách booking không hợp lệ.');
  });

  it('rejects unknown statuses and non-finite money', () => {
    expect(isBooking({ ...booking, status: 'PAID' })).toBe(false);
    expect(isBooking({ ...booking, totalAmount: Number.NaN })).toBe(false);
    expect(
      isBooking({ ...booking, priceItems: [{ ...priceItem, amount: '1' }] }),
    ).toBe(false);
  });

  it('validates availability fields before the panel can trust them', () => {
    expect(
      isAvailability({
        available: true,
        reason: null,
        totalAmount: 100001,
        currency: 'VND',
        cleanupMinutes: 15,
        timezone: booking.timezone,
        serverNow: '2035-01-08T00:00:00Z',
        occupiedUntil: '2035-01-08T02:15:00Z',
        priceItems: [priceItem],
      }),
    ).toBe(true);
    expect(
      isAvailability({
        available: 'yes',
        reason: null,
        totalAmount: 100001,
      }),
    ).toBe(false);
  });
});
