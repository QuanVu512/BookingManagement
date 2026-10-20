import { describe, expect, it } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import {
  bookingExpiryBatchSize,
  bookingExpiryIntervalMs,
} from './booking-expiry.config.js';

const config = (value?: string) =>
  ({ get: () => value }) as unknown as ConfigService;

describe('booking expiry configuration', () => {
  it('uses safe defaults when unset or empty', () => {
    expect(bookingExpiryIntervalMs(config(undefined))).toBe(15_000);
    expect(bookingExpiryIntervalMs(config('  '))).toBe(15_000);
    expect(bookingExpiryBatchSize(config(undefined))).toBe(100);
  });

  it('accepts values inside the documented bounds', () => {
    expect(bookingExpiryIntervalMs(config('5000'))).toBe(5_000);
    expect(bookingExpiryIntervalMs(config('300000'))).toBe(300_000);
    expect(bookingExpiryBatchSize(config('1'))).toBe(1);
    expect(bookingExpiryBatchSize(config('1000'))).toBe(1_000);
  });

  it.each([
    ['not-a-number', 'BOOKING_EXPIRY_INTERVAL_MS'],
    ['4999', 'BOOKING_EXPIRY_INTERVAL_MS'],
    ['300001', 'BOOKING_EXPIRY_INTERVAL_MS'],
  ])('rejects interval %s', (value, name) => {
    expect(() => bookingExpiryIntervalMs(config(value))).toThrow(name);
  });

  it.each(['0', '1001', '1.5'])('rejects batch size %s', (value) => {
    expect(() => bookingExpiryBatchSize(config(value))).toThrow(
      'BOOKING_EXPIRY_BATCH_SIZE',
    );
  });
});
