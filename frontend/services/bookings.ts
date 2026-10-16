import { API_BASE_URL, AUTH_REQUEST_TIMEOUT_MS } from '../constants/network';
import { csrfToken } from './auth';
import type {
  Availability,
  BookingInput,
  BookingRecord,
  PriceItem,
} from '../types/booking';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
function isPriceItem(value: unknown): value is PriceItem {
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
function isAvailability(value: unknown): value is Availability {
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
async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  caller?: AbortSignal,
) {
  const signal = AbortSignal.any([
    AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    ...(caller ? [caller] : []),
  ]);
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await csrfToken(signal);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE_URL}/api/${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    signal,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Không xử lý được yêu cầu đặt sân.',
    );
  if (!isRecord(payload) || payload.success !== true)
    throw new Error('Phản hồi đặt sân không hợp lệ.');
  return payload;
}
export async function checkAvailability(
  courtId: string,
  startsAt: string,
  endsAt: string,
) {
  const query = new URLSearchParams({ startsAt, endsAt });
  const payload = await request(
    `courts/${encodeURIComponent(courtId)}/availability?${query}`,
  );
  if (!isAvailability(payload.data)) throw new Error('Báo giá không hợp lệ.');
  return payload.data;
}
export async function createBooking(input: BookingInput) {
  const payload = await request('bookings', 'POST', input);
  if (!isBooking(payload.data))
    throw new Error('Booking chưa được xác nhận. Hãy thử lại cùng thông tin.');
  return payload.data;
}
export async function myBookings(signal?: AbortSignal, cursor?: string) {
  const payload = await request(
    `bookings/me${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    'GET',
    undefined,
    signal,
  );
  if (
    !Array.isArray(payload.data) ||
    !payload.data.every(isBooking) ||
    !(payload.nextCursor === null || typeof payload.nextCursor === 'string')
  )
    throw new Error('Danh sách booking không hợp lệ.');
  return { data: payload.data, nextCursor: payload.nextCursor };
}
export async function cancelBooking(id: string) {
  const payload = await request(
    `bookings/${encodeURIComponent(id)}/cancel`,
    'PATCH',
  );
  if (!isBooking(payload.data))
    throw new Error('Chưa xác nhận được kết quả hủy. Hãy tải lại.');
  return payload.data;
}
