import { describe, expect, it } from '@jest/globals';
import {
  checkinEligibility,
  readCheckinWindow,
} from './checkin-eligibility.js';

const STARTS_AT = Date.UTC(2035, 0, 8, 1, 0, 0);
const ENDS_AT = Date.UTC(2035, 0, 8, 2, 0, 0);
const WINDOW = { minutesBeforeStart: 30, minutesAfterStart: 15 };

function base(overrides: Record<string, unknown> = {}) {
  return {
    status: 'CONFIRMED',
    netCredited: 150_000,
    totalAmount: 150_000,
    hasCheckin: false,
    nowMs: STARTS_AT - 10 * 60_000,
    startsAtMs: STARTS_AT,
    endsAtMs: ENDS_AT,
    window: WINDOW,
    ...overrides,
  };
}

describe('checkinEligibility (C10)', () => {
  it('đủ điều kiện trong cửa sổ, đủ tiền, CONFIRMED', () => {
    expect(checkinEligibility(base())).toEqual({ eligible: true });
  });

  it('từ chối HOLDING và trạng thái terminal', () => {
    expect(checkinEligibility(base({ status: 'HOLDING' }))).toEqual({
      eligible: false,
      code: 'NOT_CONFIRMED',
    });
    for (const status of ['EXPIRED', 'CANCELLED', 'COMPLETED', 'NO_SHOW']) {
      expect(checkinEligibility(base({ status }))).toEqual({
        eligible: false,
        code: 'TERMINAL',
      });
    }
  });

  it('từ chối khi đã check-in (status hoặc cờ)', () => {
    expect(checkinEligibility(base({ status: 'CHECKED_IN' }))).toEqual({
      eligible: false,
      code: 'ALREADY_CHECKED_IN',
    });
    expect(checkinEligibility(base({ hasCheckin: true }))).toEqual({
      eligible: false,
      code: 'ALREADY_CHECKED_IN',
    });
  });

  it('từ chối khi thiếu tiền (I10: đủ net mới check-in)', () => {
    expect(checkinEligibility(base({ netCredited: 45_000 }))).toEqual({
      eligible: false,
      code: 'INSUFFICIENT_BALANCE',
    });
  });

  it('fail-closed khi window chưa cấu hình (D02)', () => {
    expect(checkinEligibility(base({ window: null }))).toEqual({
      eligible: false,
      code: 'WINDOW_UNCONFIGURED',
    });
  });

  it('quá sớm / quá muộn / sau endsAt', () => {
    expect(
      checkinEligibility(base({ nowMs: STARTS_AT - 31 * 60_000 })),
    ).toEqual({ eligible: false, code: 'TOO_EARLY' });
    expect(
      checkinEligibility(base({ nowMs: STARTS_AT + 16 * 60_000 })),
    ).toEqual({ eligible: false, code: 'TOO_LATE' });
    expect(checkinEligibility(base({ nowMs: ENDS_AT }))).toEqual({
      eligible: false,
      code: 'TOO_LATE',
    });
  });
});

describe('readCheckinWindow', () => {
  it('thiếu cấu hình → giá trị D02 đã duyệt (mở đúng startsAt)', () => {
    expect(readCheckinWindow(() => undefined)).toEqual({
      minutesBeforeStart: 0,
      minutesAfterStart: 24 * 60,
    });
  });

  it('config tường minh không hợp lệ → null (fail-closed)', () => {
    expect(
      readCheckinWindow((name) =>
        name.includes('BEFORE') ? 'abc' : '15',
      ),
    ).toBeNull();
    expect(
      readCheckinWindow((name) =>
        name.includes('BEFORE') ? '-1' : '15',
      ),
    ).toBeNull();
  });

  it('đọc đúng khi cấu hình hợp lệ', () => {
    expect(
      readCheckinWindow((name) =>
        name.includes('BEFORE') ? '30' : '15',
      ),
    ).toEqual({ minutesBeforeStart: 30, minutesAfterStart: 15 });
  });
});
