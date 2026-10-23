import {
  API_BASE_URL,
  AUTH_REQUEST_TIMEOUT_MS,
} from '../../../constants/network';
import { csrfToken } from '../../../services/auth';
import type { BookingInput, ServiceSelection } from '../model/booking';
import {
  isRecord,
  parseAvailability,
  parseBooking,
  parseBookingPage,
  parseCancelledBooking,
  parseServiceProducts,
} from './booking-contract';

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  caller?: AbortSignal,
  isReadOnly = false,
) {
  const signal = AbortSignal.any([
    AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    ...(caller ? [caller] : []),
  ]);
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    if (!isReadOnly) headers['X-CSRF-Token'] = await csrfToken(signal);
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
  services: ServiceSelection[] = [],
) {
  if (services.length) {
    const payload = await request(
      `courts/${encodeURIComponent(courtId)}/quote`,
      'POST',
      { startsAt, endsAt, services },
      undefined,
      true,
    );
    return parseAvailability(payload.data, services);
  }
  const query = new URLSearchParams({ startsAt, endsAt });
  const payload = await request(
    `courts/${encodeURIComponent(courtId)}/availability?${query}`,
  );
  return parseAvailability(payload.data);
}

export async function createBooking(input: BookingInput) {
  const payload = await request('bookings', 'POST', input);
  return parseBooking(payload.data, input.services);
}

export async function loadServiceProducts(
  courtId: string,
  signal: AbortSignal,
  window?: { startsAt: string; endsAt: string },
) {
  const query = window ? `?${new URLSearchParams(window)}` : '';
  const payload = await request(
    `courts/${encodeURIComponent(courtId)}/services${query}`,
    'GET',
    undefined,
    signal,
  );
  return parseServiceProducts(payload.data);
}

export async function myBookings(signal?: AbortSignal, cursor?: string) {
  const payload = await request(
    `bookings/me${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
    'GET',
    undefined,
    signal,
  );
  return parseBookingPage(payload);
}

export async function cancelBooking(id: string) {
  const payload = await request(
    `bookings/${encodeURIComponent(id)}/cancel`,
    'PATCH',
  );
  return parseCancelledBooking(payload.data);
}
