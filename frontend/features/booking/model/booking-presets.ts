import type { BookingWindow } from './booking';

const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '09:00';

export const BOOKING_PERIODS = [
  { label: 'Buổi sáng', hours: [6, 7, 8, 9, 10, 11] },
  { label: 'Buổi chiều', hours: [12, 13, 14, 15, 16] },
  { label: 'Buổi tối', hours: [17, 18, 19, 20, 21, 22] },
];

export function presetTime(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

export function selectPreset(
  window: BookingWindow,
  hour: number,
): BookingWindow {
  const date = window.start.slice(0, 10);
  const start = `${date}T${presetTime(hour)}`;
  const end = `${date}T${presetTime(hour + 1)}`;
  if (start === window.end) return { ...window, end };
  if (end === window.start) return { ...window, start };
  return { start, end };
}

export function changeBookingDate(
  window: BookingWindow,
  date: string,
): BookingWindow {
  return {
    start: date
      ? `${date}T${window.start.slice(11) || DEFAULT_START_TIME}`
      : '',
    end: date ? `${date}T${window.end.slice(11) || DEFAULT_END_TIME}` : '',
  };
}
