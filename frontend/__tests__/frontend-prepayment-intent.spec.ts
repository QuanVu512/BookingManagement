import { describe, expect, it } from '@jest/globals';
import {
  bookingRequestInput,
  requestFingerprint,
} from '../features/booking/hooks/booking-request-intent.js';

const window = { start: '2035-01-08T08:00', end: '2035-01-08T09:00' };

describe('Tỷ lệ phần trăm đặt cọc thanh toán (C06: mặc định 30% và khóa chống trùng lặp)', () => {
  it('C06 (Mặc định 30%): mặc định đặt cọc 30% và gắn tỷ lệ phần trăm vào dấu vân tay khóa chống trùng lặp', () => {
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

  it('C06 (Đổi tỷ lệ cọc): chấp nhận giá trị 30% rõ ràng và thay đổi khóa idempotency khi tỷ lệ cọc thay đổi', () => {
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
