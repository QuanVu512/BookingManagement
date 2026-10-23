import {
  bookingDateBounds,
  isBookableDate,
  assertBookableWindow,
  formatBookingDate,
  bookingTime,
} from '../features/booking/model/booking-time';
import { describe, expect, it } from '@jest/globals';
import {
  changeBookingDate,
  selectPreset,
} from '../features/booking/model/booking-presets';

const WINDOW = { start: '2035-01-08T08:00', end: '2035-01-08T09:00' };

describe('Booking schedule selection', () => {
  it('extends adjacent hours into one continuous API interval', () => {
    expect(selectPreset(WINDOW, 9)).toEqual({
      ...WINDOW,
      end: '2035-01-08T10:00',
    });
    expect(selectPreset(WINDOW, 7)).toEqual({
      ...WINDOW,
      start: '2035-01-08T07:00',
    });
  });
  it('replaces a distant selection rather than silently booking the gap', () => {
    expect(selectPreset(WINDOW, 18)).toEqual({
      start: '2035-01-08T18:00',
      end: '2035-01-08T19:00',
    });
  });
  it('preserves clock times when changing dates and recovers from clearing a date', () => {
    expect(changeBookingDate(WINDOW, '2035-01-09')).toEqual({
      start: '2035-01-09T08:00',
      end: '2035-01-09T09:00',
    });
    const cleared = changeBookingDate(WINDOW, '');
    expect(cleared).toEqual({ start: '', end: '' });
    expect(changeBookingDate(cleared, '2035-01-09')).toEqual({
      start: '2035-01-09T08:00',
      end: '2035-01-09T09:00',
    });
  });
});

describe('Booking calendar bounds and Vietnamese dates', () => {
  const timezone = 'Asia/Ho_Chi_Minh';
  it('uses branch today across a UTC date boundary and includes exactly two calendar months', () => {
    const now = new Date('2026-10-20T18:30:00Z');
    expect(bookingDateBounds(timezone, now)).toEqual({
      min: '2026-10-21',
      max: '2026-12-21',
    });
    expect(isBookableDate('2026-10-20', timezone, now)).toBe(false);
    expect(isBookableDate('2026-10-21', timezone, now)).toBe(true);
    expect(isBookableDate('2026-12-21', timezone, now)).toBe(true);
    expect(isBookableDate('2026-12-22', timezone, now)).toBe(false);
  });
  it.each([
    ['2026-12-31T05:00:00Z', '2027-02-28'],
    ['2027-12-31T05:00:00Z', '2028-02-29'],
  ])('clamps the last day when adding months to %s', (now, max) => {
    expect(bookingDateBounds(timezone, new Date(now)).max).toBe(max);
  });
  it('rejects invalid dates and either endpoint outside the allowed days', () => {
    const now = new Date('2026-10-21T05:00:00Z');
    expect(isBookableDate('2026-11-31', timezone, now)).toBe(false);
    expect(() =>
      assertBookableWindow(
        { start: '2026-12-21T08:00', end: '2026-12-22T09:00' },
        timezone,
        now,
      ),
    ).toThrow('21/12/2026');
  });
  it('always displays two-digit days/months and a four-digit year', () => {
    expect(formatBookingDate('2035-01-08')).toBe('08/01/2035');
    expect(bookingTime('2035-01-07T23:11:00Z', timezone)).toContain(
      '08/01/2035',
    );
    expect(bookingTime('2035-01-07T23:11:00Z', timezone)).toContain('06:11');
  });
});
