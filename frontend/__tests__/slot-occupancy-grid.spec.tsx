import {
  findSlotOccupancy,
  intervalsOverlap,
  isOutsideBusinessHours,
  isSelfHoldSlot,
  isWindowConflict,
  slotBoundaryToUtcMs,
} from '../features/booking/model/booking-occupancy';
import { parseCourtDayOccupancies } from '../features/booking/api/booking-contract';

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const CLEANUP = 15;

function occupancy(
  startsAt: string,
  bufferEndsAt: string,
  kind: 'HOLDING' | 'CONFIRMED' | 'MAINTENANCE' = 'HOLDING',
) {
  return { startsAt, bufferEndsAt, kind };
}

describe('booking occupancy helpers', () => {
  it('treats touching edges as available (half-open)', () => {
    expect(intervalsOverlap(8, 10, 10, 12)).toBe(false);
    expect(intervalsOverlap(8, 10, 9, 12)).toBe(true);
  });

  it('locks a slot whose buffer reaches into another occupancy', () => {
    // Slot 08:00-09:00 ICT with 15min cleanup occupies [08:00, 09:15).
    const startMs = slotBoundaryToUtcMs('2026-10-29', 8, TIMEZONE);
    const blockingStart = new Date(startMs + 70 * 60 * 1000).toISOString();
    const blockingEnd = new Date(startMs + 130 * 60 * 1000).toISOString();
    const found = findSlotOccupancy('2026-10-29', 8, TIMEZONE, CLEANUP, [
      occupancy(blockingStart, blockingEnd),
    ]);
    expect(found?.kind).toBe('HOLDING');
  });

  it('allows a slot whose buffer exactly touches the next occupancy', () => {
    const startMs = slotBoundaryToUtcMs('2026-10-29', 8, TIMEZONE);
    // Occupancy starts exactly at 09:15 ICT (slot end + cleanup).
    const blockingStart = new Date(startMs + 75 * 60 * 1000).toISOString();
    const blockingEnd = new Date(startMs + 135 * 60 * 1000).toISOString();
    expect(
      findSlotOccupancy('2026-10-29', 8, TIMEZONE, CLEANUP, [
        occupancy(blockingStart, blockingEnd),
      ]),
    ).toBeNull();
  });

  it('detects a multi-slot window conflict only once (no wipe)', () => {
    const window = { start: '2026-10-29T08:00', end: '2026-10-29T10:00' };
    const startMs = slotBoundaryToUtcMs('2026-10-29', 9, TIMEZONE);
    const blocking = [
      occupancy(
        new Date(startMs + 30 * 60 * 1000).toISOString(),
        new Date(startMs + 90 * 60 * 1000).toISOString(),
        'CONFIRMED',
      ),
    ];
    expect(isWindowConflict(window, TIMEZONE, CLEANUP, blocking)).toBe(true);
    expect(isWindowConflict(window, TIMEZONE, CLEANUP, [])).toBe(false);
  });

  it('recognises the current user hold window as self-hold', () => {
    const startMs = slotBoundaryToUtcMs('2026-10-29', 8, TIMEZONE);
    const booking = {
      startsAt: new Date(startMs).toISOString(),
      endsAt: new Date(startMs + 60 * 60 * 1000).toISOString(),
    };
    expect(isSelfHoldSlot('2026-10-29', 8, TIMEZONE, booking)).toBe(true);
    expect(isSelfHoldSlot('2026-10-29', 9, TIMEZONE, booking)).toBe(false);
    expect(isSelfHoldSlot('2026-10-29', 8, TIMEZONE, undefined)).toBe(false);
  });

  it('compares business hours by minutes, not whole hours', () => {
    const halfPast = { isClosed: false, open: '06:30', close: '22:30' };
    // 06:00 slot starts before a 06:30 opening -> outside.
    expect(isOutsideBusinessHours(6, halfPast)).toBe(true);
    // 22:00 slot ends at 23:00, past a 22:30 close -> outside.
    expect(isOutsideBusinessHours(22, halfPast)).toBe(true);
    // 21:00 slot ends exactly at close -> inside.
    expect(isOutsideBusinessHours(21, halfPast)).toBe(false);
    // Whole-hour bounds keep working.
    const whole = { isClosed: false, open: '06:00', close: '23:00' };
    expect(isOutsideBusinessHours(6, whole)).toBe(false);
    expect(isOutsideBusinessHours(22, whole)).toBe(false);
    // Closed or unconfigured days stay outside.
    expect(
      isOutsideBusinessHours(10, { isClosed: true, open: null, close: null }),
    ).toBe(true);
  });
});

describe('parseCourtDayOccupancies', () => {
  const valid = {
    courtId: 'court-1',
    date: '2026-10-29',
    timezone: TIMEZONE,
    serverNow: '2026-10-28T00:00:00.000Z',
    cleanupMinutes: 15,
    businessHours: { isClosed: false, open: '06:00', close: '23:00' },
    occupiedIntervals: [
      {
        startsAt: '2026-10-29T01:00:00.000Z',
        bufferEndsAt: '2026-10-29T02:15:00.000Z',
        kind: 'HOLDING',
      },
    ],
  };

  it('accepts a valid payload', () => {
    expect(parseCourtDayOccupancies(valid).occupiedIntervals).toHaveLength(1);
  });

  it('rejects unknown kinds and malformed intervals', () => {
    expect(() =>
      parseCourtDayOccupancies({
        ...valid,
        occupiedIntervals: [
          { startsAt: 'x', bufferEndsAt: 'y', kind: 'HOLDING' },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseCourtDayOccupancies({
        ...valid,
        occupiedIntervals: [
          {
            startsAt: '2026-10-29T01:00:00.000Z',
            bufferEndsAt: '2026-10-29T02:15:00.000Z',
            kind: 'GHOST',
          },
        ],
      }),
    ).toThrow();
  });
});
