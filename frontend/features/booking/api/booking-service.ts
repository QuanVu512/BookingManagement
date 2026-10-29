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
  parseCourtDayOccupancies,
  parseServiceProducts,
} from './booking-contract';

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  caller?: AbortSignal,
  isReadOnly = false,
  guestToken?: string,
) {
  const signal = AbortSignal.any([
    AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    ...(caller ? [caller] : []),
  ]);
  const headers: Record<string, string> = {};
  if (guestToken) {
    headers['X-Booking-Access-Token'] = guestToken;
  }
  if (method !== 'GET') {
    if (!isReadOnly && !guestToken)
      headers['X-CSRF-Token'] = await csrfToken(signal);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE_URL}/api/${path}`, {
    method,
    credentials: guestToken ? 'omit' : 'include',
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

export async function loadCourtDayOccupancies(
  courtId: string,
  date: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ date });
  const payload = await request(
    `courts/${encodeURIComponent(courtId)}/occupancies?${params}`,
    'GET',
    undefined,
    signal,
  );
  return parseCourtDayOccupancies(payload.data);
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

export interface PaidCancelQuote {
  quoteId: string;
  bookingId: string;
  totalAmount: number;
  paidAmount: number;
  penaltyAmount: number;
  refundAmount: number;
  currency: string;
  policyText: string;
  expiresAt: string;
  replayed: boolean;
}

export interface PaidCancelApplied {
  bookingId: string;
  bookingCode: string;
  status: string;
  penaltyAmount: number;
  totalRefund: number;
  refundRequestIds: string[];
  replayed: boolean;
}

function parsePaidCancelQuote(data: unknown): PaidCancelQuote {
  if (!isRecord(data)) throw new Error('Báo phí hủy không hợp lệ.');
  const text = (name: string): string => {
    const value = data[name];
    if (typeof value !== 'string' || !value) throw new Error(`Thiếu ${name}.`);
    return value;
  };
  const money = (name: string): number => {
    const value = data[name];
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
      throw new Error(`Thiếu ${name}.`);
    return value;
  };
  return {
    quoteId: text('quoteId'),
    bookingId: text('bookingId'),
    totalAmount: money('totalAmount'),
    paidAmount: money('paidAmount'),
    penaltyAmount: money('penaltyAmount'),
    refundAmount: money('refundAmount'),
    currency: text('currency'),
    policyText: text('policyText'),
    expiresAt: text('expiresAt'),
    replayed: data['replayed'] === true,
  };
}

function parsePaidCancelApplied(data: unknown): PaidCancelApplied {
  if (!isRecord(data)) throw new Error('Kết quả hủy không hợp lệ.');
  const text = (name: string): string => {
    const value = data[name];
    if (typeof value !== 'string' || !value) throw new Error(`Thiếu ${name}.`);
    return value;
  };
  const ids = data['refundRequestIds'];
  return {
    bookingId: text('bookingId'),
    bookingCode: text('bookingCode'),
    status: text('status'),
    penaltyAmount:
      typeof data['penaltyAmount'] === 'number' ? data['penaltyAmount'] : 0,
    totalRefund:
      typeof data['totalRefund'] === 'number' ? data['totalRefund'] : 0,
    refundRequestIds: Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string')
      : [],
    replayed: data['replayed'] === true,
  };
}

/** C08 member: báo phí hủy có hoàn (booking CONFIRMED). */
export async function requestCancelQuote(
  id: string,
  input: { reason?: string; idempotencyKey: string; signal?: AbortSignal },
) {
  const payload = await request(
    `bookings/${encodeURIComponent(id)}/cancel-quote`,
    'POST',
    { reason: input.reason, idempotencyKey: input.idempotencyKey },
    input.signal,
  );
  return parsePaidCancelQuote(payload.data);
}

/** C08 member: áp dụng hủy (accepted phải true tường minh). */
export async function applyCancelBooking(
  id: string,
  input: {
    quoteId: string;
    accepted: boolean;
    idempotencyKey: string;
    signal?: AbortSignal;
  },
) {
  const payload = await request(
    `bookings/${encodeURIComponent(id)}/cancel-apply`,
    'POST',
    {
      quoteId: input.quoteId,
      accepted: input.accepted,
      idempotencyKey: input.idempotencyKey,
    },
    input.signal,
  );
  return parsePaidCancelApplied(payload.data);
}

/** C08 guest: báo phí hủy qua scoped token. */
export async function requestGuestCancelQuote(
  bookingId: string,
  guestToken: string,
  input: { reason?: string; idempotencyKey: string; signal?: AbortSignal },
) {
  const payload = await request(
    `guest/bookings/${encodeURIComponent(bookingId)}/cancel-quote`,
    'POST',
    { reason: input.reason, idempotencyKey: input.idempotencyKey },
    input.signal,
    false,
    guestToken,
  );
  return parsePaidCancelQuote(payload.data);
}

/** C08 guest: áp dụng hủy qua scoped token. */
export async function applyGuestCancelBooking(
  bookingId: string,
  guestToken: string,
  input: {
    quoteId: string;
    accepted: boolean;
    idempotencyKey: string;
    signal?: AbortSignal;
  },
) {
  const payload = await request(
    `guest/bookings/${encodeURIComponent(bookingId)}/cancel-apply`,
    'POST',
    {
      quoteId: input.quoteId,
      accepted: input.accepted,
      idempotencyKey: input.idempotencyKey,
    },
    input.signal,
    false,
    guestToken,
  );
  return parsePaidCancelApplied(payload.data);
}
