'use client';

import { useBookingDateBounds } from '../hooks/use-live-booking';
import { changeBookingDate } from '../model/booking-presets';
import type { LiveBookingViewProps } from './live-booking-view';

const DAY_COUNT = 7;
const DATE_PART_LENGTH = 10;

export function bookingDays(first: string) {
  return Array.from({ length: DAY_COUNT }, (_, index) => {
    const date = new Date(`${first}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const label =
      index === 0
        ? 'Hôm nay'
        : index === 1
          ? 'Ngày mai'
          : new Intl.DateTimeFormat('vi-VN', {
              weekday: 'long',
              timeZone: 'UTC',
            }).format(date);
    return {
      value: date.toISOString().slice(0, DATE_PART_LENGTH),
      label,
      day: new Intl.DateTimeFormat('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
      }).format(date),
    };
  });
}

export function BookingDayStrip({
  state,
  timezone,
  onChangeWindow,
}: Pick<LiveBookingViewProps, 'state' | 'timezone' | 'onChangeWindow'>) {
  const bounds = useBookingDateBounds(timezone);
  return (
    <div
      className="arena-day-strip"
      role="group"
      aria-label="Ngày chơi trong tuần"
    >
      {bookingDays(bounds.min).map((day) => (
        <button
          key={day.value}
          type="button"
          disabled={state.busy}
          aria-pressed={state.window.start.startsWith(day.value)}
          onClick={() =>
            onChangeWindow(changeBookingDate(state.window, day.value))
          }
        >
          <span>{day.label}</span>
          <strong>{day.day}</strong>
        </button>
      ))}
    </div>
  );
}
