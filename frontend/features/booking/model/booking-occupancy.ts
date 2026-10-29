'use client';

export type OccupancyKind = 'HOLDING' | 'CONFIRMED' | 'MAINTENANCE';
export type SlotStatus =
  'PAST' | 'UNAVAILABLE' | 'OCCUPIED' | 'SELECTED' | 'AVAILABLE';

export interface OccupiedInterval {
  startsAt: string;
  bufferEndsAt: string;
  kind: OccupancyKind;
}

export const OCCUPANCY_LABELS: Record<OccupancyKind, string> = {
  HOLDING: 'Đang giữ chỗ',
  CONFIRMED: 'Đã đặt',
  MAINTENANCE: 'Bảo trì',
};

const SLOT_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const HOLD_LEAD_MS = 5 * MINUTE_MS;

function wallClockParts(
  instant: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (key: string): number =>
    Number(parts.find((value) => value.type === key)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
  };
}

/** Local wall-clock date+hour (slot boundary) converted to a UTC timestamp. */
export function slotBoundaryToUtcMs(
  date: string,
  hour: number,
  timezone: string,
): number {
  const [year, month, day] = date.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day, hour, 0);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = wallClockParts(new Date(instant), timezone);
    const renderedMs = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
    );
    instant += target - renderedMs;
  }
  return instant;
}

/** Half-open overlap: [startA, endA) vs [startB, endB). Touching edges pass. */
export function intervalsOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): boolean {
  return startA < endB && endA > startB;
}

export function findSlotOccupancy(
  date: string,
  hour: number,
  timezone: string,
  cleanupMinutes: number,
  occupiedIntervals: OccupiedInterval[],
): OccupiedInterval | null {
  const slotStartMs = slotBoundaryToUtcMs(date, hour, timezone);
  const slotEndMs = slotStartMs + SLOT_MS;
  const candidateUntilMs = slotEndMs + cleanupMinutes * MINUTE_MS;
  for (const interval of occupiedIntervals) {
    const startMs = Date.parse(interval.startsAt);
    const endMs = Date.parse(interval.bufferEndsAt);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    if (intervalsOverlap(slotStartMs, candidateUntilMs, startMs, endMs)) {
      return interval;
    }
  }
  return null;
}

export function isWindowConflict(
  window: { start: string; end: string },
  timezone: string,
  cleanupMinutes: number,
  occupiedIntervals: OccupiedInterval[],
): boolean {
  if (!window.start || !window.end) return false;
  const startIso = localInputToUtcIso(window.start, timezone);
  const endIso = localInputToUtcIso(window.end, timezone);
  if (startIso === null || endIso === null) return false;
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return false;
  }
  const occupiedUntilMs = endMs + cleanupMinutes * MINUTE_MS;
  return occupiedIntervals.some((interval) => {
    const occStart = Date.parse(interval.startsAt);
    const occEnd = Date.parse(interval.bufferEndsAt);
    if (!Number.isFinite(occStart) || !Number.isFinite(occEnd)) return false;
    return intervalsOverlap(startMs, occupiedUntilMs, occStart, occEnd);
  });
}

function localInputToUtcIso(value: string, timezone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = wallClockParts(new Date(instant), timezone);
    const renderedMs = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
    );
    instant += target - renderedMs;
  }
  const check = wallClockParts(new Date(instant), timezone);
  const matches =
    check.year === year &&
    check.month === month &&
    check.day === day &&
    check.hour === hour &&
    check.minute === minute;
  if (!matches) return null;
  return new Date(instant).toISOString();
}

export function isSlotPast(
  date: string,
  hour: number,
  timezone: string,
  nowMs: number,
): boolean {
  return slotBoundaryToUtcMs(date, hour, timezone) <= nowMs;
}

function toDayMinutes(label: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(label);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours > 23 ||
    minutes > 59
  ) {
    return null;
  }
  return hours * 60 + minutes;
}

export function isOutsideBusinessHours(
  hour: number,
  businessHours: {
    isClosed: boolean;
    open: string | null;
    close: string | null;
  },
): boolean {
  if (businessHours.isClosed) return true;
  if (!businessHours.open || !businessHours.close) return true;
  const openMinutes = toDayMinutes(businessHours.open);
  const closeMinutes = toDayMinutes(businessHours.close);
  if (openMinutes === null || closeMinutes === null) return true;
  const slotStartMinutes = hour * 60;
  const slotEndMinutes = (hour + 1) * 60;
  return slotStartMinutes < openMinutes || slotEndMinutes > closeMinutes;
}

export function isTooSoon(
  date: string,
  hour: number,
  timezone: string,
  nowMs: number,
): boolean {
  return slotBoundaryToUtcMs(date, hour, timezone) - nowMs < HOLD_LEAD_MS;
}

/** True when the slot equals the current user's own hold window (self-hold). */
export function isSelfHoldSlot(
  date: string,
  hour: number,
  timezone: string,
  booking: { startsAt: string; endsAt: string } | undefined,
): boolean {
  if (!booking) return false;
  const slotStartMs = slotBoundaryToUtcMs(date, hour, timezone);
  const slotEndMs = slotStartMs + SLOT_MS;
  const holdStart = Date.parse(booking.startsAt);
  const holdEnd = Date.parse(booking.endsAt);
  if (!Number.isFinite(holdStart) || !Number.isFinite(holdEnd)) return false;
  return slotStartMs >= holdStart && slotEndMs <= holdEnd;
}
