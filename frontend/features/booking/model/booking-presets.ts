import type { BookingWindow } from './booking';
import { isSlotInPast, DEFAULT_BOOKING_TIMEZONE } from './booking-time';

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

  const currentStart = window.start.slice(11);
  const currentEnd = window.end.slice(11);
  const targetStart = presetTime(hour);
  const targetEnd = presetTime(hour + 1);

  // Nếu chưa chọn giờ nào (hoặc đã bị bỏ chọn trước đó)
  if (!currentStart || !currentEnd) {
    return { start, end };
  }

  // Trường hợp 1: Đang chọn đúng 1 slot này duy nhất -> ấn thêm lần nữa là BỎ CHỌN
  if (currentStart === targetStart && currentEnd === targetEnd) {
    return {
      start: `${date}T`,
      end: `${date}T`,
    };
  }

  // Trường hợp 2: Đang chọn một dải nhiều slot
  // Bấm vào slot đầu dải -> bỏ slot đầu (thu hẹp dải từ bên trái)
  if (currentStart === targetStart && currentEnd > targetEnd) {
    return {
      start: `${date}T${targetEnd}`,
      end: window.end,
    };
  }

  // Bấm vào slot cuối dải -> bỏ slot cuối (thu hẹp dải từ bên phải)
  if (currentEnd === targetEnd && currentStart < targetStart) {
    return {
      start: window.start,
      end: `${date}T${targetStart}`,
    };
  }

  // Trường hợp 3: Mở rộng dải liền kề
  if (start === window.end) return { ...window, end };
  if (end === window.start) return { ...window, start };

  // Trường hợp 4: Chọn nhảy giờ (khung giờ không liền kề hoặc bấm vào giữa dải)
  // -> Hủy chọn dải cũ và chọn slot mới này
  return { start, end };
}

export function changeBookingDate(
  window: BookingWindow,
  date: string,
  timezone: string = DEFAULT_BOOKING_TIMEZONE,
): BookingWindow {
  if (!date) {
    return { start: '', end: '' };
  }

  let startTime = window.start.slice(11) || DEFAULT_START_TIME;
  let endTime = window.end.slice(11) || DEFAULT_END_TIME;

  // Nếu chọn ngày hôm nay mà khung giờ bắt đầu đã qua,
  // tự động nhảy sang khung giờ sắp tới sớm nhất trong ngày
  const startHour = parseInt(startTime.slice(0, 2), 10);
  if (isSlotInPast(date, startHour, timezone)) {
    const allHours = BOOKING_PERIODS.flatMap((p) => p.hours);
    const nextAvailableHour = allHours.find((h) => !isSlotInPast(date, h, timezone));
    if (nextAvailableHour !== undefined) {
      startTime = presetTime(nextAvailableHour);
      endTime = presetTime(nextAvailableHour + 1);
    }
  }

  return {
    start: `${date}T${startTime}`,
    end: `${date}T${endTime}`,
  };
}
