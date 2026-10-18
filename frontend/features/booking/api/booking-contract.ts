import type { Availability, BookingRecord, PriceItem } from '../model/booking';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
export function isPriceItem(value: unknown): value is PriceItem {
  return (
    isRecord(value) &&
    typeof value.startsAt === 'string' &&
    typeof value.endsAt === 'string' &&
    ['durationMinutes', 'pricePerHour', 'amount'].every(
      (key) => typeof value[key] === 'number' && Number.isFinite(value[key]),
    )
  );
}
export function isBooking(value: unknown): value is BookingRecord {
  return (
    isRecord(value) &&
    [
      'id',
      'bookingCode',
      'courtId',
      'courtName',
      'timezone',
      'startsAt',
      'endsAt',
      'holdExpiresAt',
      'currency',
    ].every((key) => typeof value[key] === 'string') &&
    typeof value.status === 'string' &&
    [
      'HOLDING',
      'EXPIRED',
      'CANCELLED',
      'CONFIRMED',
      'CHECKED_IN',
      'COMPLETED',
      'NO_SHOW',
    ].includes(value.status) &&
    typeof value.totalAmount === 'number' &&
    Number.isFinite(value.totalAmount) &&
    Array.isArray(value.priceItems) &&
    value.priceItems.every(isPriceItem)
  );
}
export function isAvailability(value: unknown): value is Availability {
  return (
    isRecord(value) &&
    typeof value.available === 'boolean' &&
    (value.reason === null || typeof value.reason === 'string') &&
    ['timezone', 'serverNow', 'occupiedUntil', 'currency'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    typeof value.totalAmount === 'number' &&
    typeof value.cleanupMinutes === 'number' &&
    Array.isArray(value.priceItems) &&
    value.priceItems.every(isPriceItem)
  );
}

export function parseAvailability(value: unknown): Availability {
  if (!isAvailability(value)) throw new Error('Báo giá không hợp lệ.');
  return value;
}

export function parseBooking(value: unknown): BookingRecord {
  if (!isBooking(value))
    throw new Error('Booking chưa được xác nhận. Hãy thử lại cùng thông tin.');
  return value;
}

export function parseCancelledBooking(value: unknown): BookingRecord {
  if (!isBooking(value))
    throw new Error('Chưa xác nhận được kết quả hủy. Hãy tải lại.');
  return value;
}

export function parseBookingPage(value: unknown) {
  if (
    !isRecord(value) ||
    !Array.isArray(value.data) ||
    !value.data.every(isBooking) ||
    !(value.nextCursor === null || typeof value.nextCursor === 'string')
  )
    throw new Error('Danh sách booking không hợp lệ.');
  return { data: value.data, nextCursor: value.nextCursor };
}
