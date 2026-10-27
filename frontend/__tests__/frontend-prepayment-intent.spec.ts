import { describe, expect, it } from '@jest/globals';
import {
  bookingRequestInput,
  requestFingerprint,
} from '../features/booking/hooks/booking-request-intent.js';

const window = { start: '2035-01-08T08:00', end: '2035-01-08T09:00' };

describe('prepayment percent intent (C06)', () => {
  it('defaults to 30% and binds percent into the idempotency fingerprint', () => {
    const key = { fingerprint: '', key: '' };
    const input = bookingRequestInput(
      { courtId: 'court-1', timezone: 'Asia/Ho_Chi_Minh', window },
      key,
    );
    expect(input.prepaymentPercent).toBe(30);
    expect(key.fingerprint).toBe(
      requestFingerprint({
        courtId: 'court-1',
        timezone: 'Asia/Ho_Chi_Minh',
        window,
      }),
    );
  });

  it('passes explicit 30% through and rotates the key on percent change', () => {
    const key = { fingerprint: '', key: '' };
    const first = bookingRequestInput(
      {
        courtId: 'court-1',
        timezone: 'Asia/Ho_Chi_Minh',
        window,
        prepaymentPercent: 30,
      },
      key,
    );
    expect(first.prepaymentPercent).toBe(30);
    const firstKey = key.key;
    const second = bookingRequestInput(
      {
        courtId: 'court-1',
        timezone: 'Asia/Ho_Chi_Minh',
        window,
        prepaymentPercent: 100,
      },
      key,
    );
    expect(second.prepaymentPercent).toBe(100);
    expect(key.key).not.toBe(firstKey);
  });
});
