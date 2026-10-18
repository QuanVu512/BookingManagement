const MINUTE_MS = 60_000;
export const BOOKING_REFRESH_MS = 15_000;

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
    dateStyle: 'short',
    timeStyle: 'short',
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
