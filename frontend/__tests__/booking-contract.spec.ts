import { describe, expect, it } from '@jest/globals';
import {
  isAvailability,
  isBooking,
  parseBookingPage,
  parseAvailability,
  parseServiceProducts,
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

const product = {
  imageUrl: '/products/paddle-carbon.jpg',
  availableQuantity: 10,
  id: 'paddle',
  code: 'PADDLE',
  name: 'Thuê vợt',
  kind: 'PADDLE',
  billingMode: 'HOURLY_RENTAL',
  unit: 'vợt',
  unitPrice: 30000,
};
const serviceLine = {
  productId: 'paddle',
  code: 'PADDLE',
  name: 'Thuê vợt',
  kind: 'PADDLE',
  billingMode: 'HOURLY_RENTAL',
  unit: 'vợt',
  unitPrice: 30000,
  quantity: 1,
  durationMinutes: 60,
  amount: 30000,
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

  it('rejects invalid inventory while preserving valid catalog images', () => {
    expect(parseServiceProducts([product])).toHaveLength(1);
    expect(() =>
      parseServiceProducts([{ ...product, availableQuantity: -1 }]),
    ).toThrow();
    expect(() =>
      parseServiceProducts([{ ...product, availableQuantity: undefined }]),
    ).toThrow();
  });

  it('rejects a sale paddle, malformed service totals, and an ignored service selection', () => {
    expect(() =>
      parseServiceProducts([{ ...product, billingMode: 'SALE' }]),
    ).toThrow();
    expect(
      isBooking({
        ...booking,
        totalAmount: 130001,
        serviceItems: [serviceLine],
      }),
    ).toBe(true);
    expect(isBooking({ ...booking, serviceItems: [serviceLine] })).toBe(false);
    const quote = {
      available: true,
      reason: null,
      totalAmount: 100001,
      currency: 'VND',
      cleanupMinutes: 15,
      timezone: booking.timezone,
      serverNow: '2035-01-08T00:00:00Z',
      occupiedUntil: '2035-01-08T02:15:00Z',
      priceItems: [priceItem],
    };
    expect(() =>
      parseAvailability(quote, [{ productId: 'paddle', quantity: 1 }]),
    ).toThrow('Dịch vụ');
  });
});
