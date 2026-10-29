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
  if (!window.start || !window.end) {
    throw new Error('Vui lòng chọn khung giờ bắt đầu và kết thúc.');
  }
  const dateStart = window.start.slice(0, 10);
  const dateEnd = window.end.slice(0, 10);
  if (
    ![dateStart, dateEnd].every((value) =>
      isBookableDate(value, timezone, now),
    )
  ) {
    const { min, max } = bookingDateBounds(timezone, now);
    throw new Error(
      `Chỉ chọn ngày từ ${formatBookingDate(min)} đến ${formatBookingDate(max)}.`,
    );
  }
  const timeStart = window.start.slice(11);
  const timeEnd = window.end.slice(11);
  if (timeStart && timeEnd && window.start >= window.end) {
    throw new Error('Giờ kết thúc phải sau giờ bắt đầu.');
  }
  if (isWindowInPast(window, timezone, now)) {
    throw new Error('Khung giờ bắt đầu đã qua thời gian hiện tại.');
  }
}

export function wallClock(instant: Date, timezone: string) {
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

export function getNowInTimezone(timezone: string, now = new Date()) {
  const local = wallClock(now, timezone);
  return {
    date: local.slice(0, 10),
    time: local.slice(11, 16),
    hour: parseInt(local.slice(11, 13), 10),
    minute: parseInt(local.slice(14, 16), 10),
    localIso: local,
  };
}

export function isSlotInPast(
  date: string,
  hour: number,
  timezone: string,
  now = new Date(),
): boolean {
  if (!date) return false;
  const current = getNowInTimezone(timezone, now);
  if (date < current.date) return true;
  if (date > current.date) return false;
  const slotStartTime = `${String(hour).padStart(2, '0')}:00`;
  return slotStartTime <= current.time;
}

export function isWindowInPast(
  window: { start: string; end: string },
  timezone: string,
  now = new Date(),
): boolean {
  if (!window.start) return false;
  const date = window.start.slice(0, 10);
  const time = window.start.slice(11, 16);
  const current = getNowInTimezone(timezone, now);
  if (date < current.date) return true;
  if (date > current.date) return false;
  return time <= current.time;
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
export function isoToLocalInput(iso: string, timezone: string) {
  const instant = new Date(iso);
  if (!Number.isFinite(instant.getTime())) {
    throw new Error('Hãy chọn ngày và giờ hợp lệ.');
  }
  const local = wallClock(instant, timezone).slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) {
    throw new Error('Hãy chọn ngày và giờ hợp lệ.');
  }
  return local;
}
export function initialBookingWindow(timezone: string, now = new Date()) {
  const current = getNowInTimezone(timezone, now);
  const allHours = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
  const upcomingHour = allHours.find((h) => !isSlotInPast(current.date, h, timezone, now));

  if (upcomingHour !== undefined) {
    const startH = String(upcomingHour).padStart(2, '0');
    const endH = String(upcomingHour + 1).padStart(2, '0');
    return {
      start: `${current.date}T${startH}:00`,
      end: `${current.date}T${endH}:00`,
    };
  }

  const tomorrow = wallClock(
    new Date(now.getTime() + 24 * 60 * MINUTE_MS),
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
