const MINUTE_MS = 60_000;
export const BOOKING_REFRESH_MS = 15_000;
const MAX_BOOKING_ADVANCE_MONTHS = 2;
export const DEFAULT_BOOKING_TIMEZONE = 'Asia/Ho_Chi_Minh';

export function formatBookingDate(value: string) {
  const date = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  return date.split('-').reverse().join('/');
}

export function bookingDateBounds(timezone: string, now = new Date()) {
  const min = wallClock(now, timezone).slice(0, 10);
  const latest = new Date(`${min}T00:00:00Z`);
  const day = latest.getUTCDate();
  latest.setUTCDate(1);
  latest.setUTCMonth(latest.getUTCMonth() + MAX_BOOKING_ADVANCE_MONTHS);
  const lastDay = new Date(
    Date.UTC(latest.getUTCFullYear(), latest.getUTCMonth() + 1, 0),
  ).getUTCDate();
  latest.setUTCDate(Math.min(day, lastDay));
  return { min, max: latest.toISOString().slice(0, 10) };
}

export function isBookableDate(
  value: string,
  timezone: string,
  now = new Date(),
) {
  const { min, max } = bookingDateBounds(timezone, now);
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value &&
    value >= min &&
    value <= max
  );
}

export function assertBookableWindow(
  window: { start: string; end: string },
  timezone: string,
  now = new Date(),
) {
  if (
    [window.start, window.end].every((value) =>
      isBookableDate(value.slice(0, 10), timezone, now),
    )
  )
    return;
  const { min, max } = bookingDateBounds(timezone, now);
  throw new Error(
    `Chỉ chọn ngày từ ${formatBookingDate(min)} đến ${formatBookingDate(max)}.`,
  );
}

function wallClock(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (key: string) =>
    parts.find((value) => value.type === key)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}
export function localInputToIso(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Hãy chọn ngày và giờ hợp lệ.');
  const target = Date.parse(`${value}:00Z`);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt++) {
    const rendered = Date.parse(
      `${wallClock(new Date(instant), timezone)}:00Z`,
    );
    instant += target - rendered;
  }
  if (
    !Number.isFinite(instant) ||
    wallClock(new Date(instant), timezone) !== value
  )
    throw new Error('Giờ địa phương không hợp lệ trong múi giờ sân.');
  return new Date(instant).toISOString();
}
export function initialBookingWindow(timezone: string) {
  const tomorrow = wallClock(
    new Date(Date.now() + 24 * 60 * MINUTE_MS),
    timezone,
  ).slice(0, 10);
  return { start: `${tomorrow}T08:00`, end: `${tomorrow}T09:00` };
}
export function bookingTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}
export function formatVnd(amount: number) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount);
}
export const BOOKING_STATUS_LABELS = {
  HOLDING: 'Đang giữ chỗ — chưa thanh toán',
  EXPIRED: 'Đã hết hạn',
  CANCELLED: 'Đã hủy',
  CONFIRMED: 'Đã xác nhận',
  CHECKED_IN: 'Đã check-in',
  COMPLETED: 'Đã hoàn tất',
  NO_SHOW: 'Không đến',
};
