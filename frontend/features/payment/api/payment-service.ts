import { API_BASE_URL, AUTH_REQUEST_TIMEOUT_MS } from '../../../constants/network';
import { csrfToken } from '../../../services/auth';
import {
  ApiRequestError,
  isRecord,
  parseNullablePaymentOutcome,
  parsePaymentOutcome,
  parsePaymentRequest,
  parseRefundTracker,
} from './payment-contract';
import type { PaymentMethod, PaymentPurpose } from '../model/payment';

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(date - Date.now(), 0);
}

async function request(
  path: string,
  method = 'GET',
  body?: unknown,
  caller?: AbortSignal,
  csrfRetried = false,
  guestToken?: string,
): Promise<{ success: boolean; data: unknown }> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    ...(caller ? [caller] : []),
  ]);
  const headers: Record<string, string> = {};
  if (guestToken) {
    // Guest-token-only: không gửi cookie credentials để giữ tách phiên.
    headers['X-Booking-Access-Token'] = guestToken;
  }
  if (method !== 'GET') {
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
  const payload: unknown =
    response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    const code =
      isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string'
        ? payload.error.code
        : null;
    const message =
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Không xử lý được yêu cầu thanh toán.';
    const error = new ApiRequestError({
      message,
      status: response.status,
      errorCode: code,
      retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
    });
    // MIG-12: retry đúng một lần cho CSRF đã nhận diện, không retry RBAC 403.
    if (error.isCsrf() && !csrfRetried && method !== 'GET') {
      return request(path, method, body, caller, true, guestToken);
    }
    throw error;
  }
  if (!isRecord(payload) || payload.success !== true)
    throw new Error('Phản hồi thanh toán không hợp lệ.');
  return payload as { success: boolean; data: unknown };
}

/** Giữ key/payload qua uncertain outcome; percent nằm trong fingerprint. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPaymentRequest(input: {
  bookingId: string;
  purpose: PaymentPurpose;
  prepaymentPercent?: 30 | 100;
  method: PaymentMethod;
  idempotencyKey: string;
  signal?: AbortSignal;
}) {
  const payload = await request(
    'payments/requests',
    'POST',
    {
      bookingId: input.bookingId,
      purpose: input.purpose,
      prepaymentPercent: input.prepaymentPercent ?? 30,
      method: input.method,
      idempotencyKey: input.idempotencyKey,
    },
    input.signal,
  );
  return parsePaymentRequest(payload.data);
}

export async function getPaymentRequest(id: string, signal?: AbortSignal) {
  const payload = await request(
    `payments/requests/${encodeURIComponent(id)}`,
    'GET',
    undefined,
    signal,
  );
  return parsePaymentRequest(payload.data);
}

export async function quoteRefund(input: {
  bookingId: string;
  cancellationRequestId: string;
  signal?: AbortSignal;
}) {
  const payload = await request(
    'payments/refunds/quote',
    'POST',
    {
      bookingId: input.bookingId,
      cancellationRequestId: input.cancellationRequestId,
    },
    input.signal,
  );
  return payload.data;
}

export async function getPaymentOutcome(
  requestId: string,
  signal?: AbortSignal,
) {
  const payload = await request(
    `payments/requests/${encodeURIComponent(requestId)}/status`,
    'GET',
    undefined,
    signal,
  );
  return parsePaymentOutcome(payload.data);
}

/** E6 owner read theo booking + purpose (RF-06B, tối đa 1 request/lần expand). */
export async function getBookingPaymentOutcome(
  bookingId: string,
  purpose: PaymentPurpose,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ bookingId, purpose });
  const payload = await request(
    `payments/requests?${query.toString()}`,
    'GET',
    undefined,
    signal,
  );
  return parseNullablePaymentOutcome(payload.data);
}

/** E11 owner refund tracker theo booking (RF-06B). */
export async function getBookingRefunds(
  bookingId: string,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ bookingId });
  const payload = await request(
    `refunds?${query.toString()}`,
    'GET',
    undefined,
    signal,
  );
  return parseRefundTracker(payload.data);
}

/** Guest: outcome qua scoped token (header, không cookie). */
export async function getGuestPaymentOutcome(input: {
  requestId: string;
  guestToken: string;
  signal?: AbortSignal;
}) {
  const payload = await request(
    `guest/payments/requests/${encodeURIComponent(input.requestId)}/status`,
    'GET',
    undefined,
    input.signal,
    false,
    input.guestToken,
  );
  return parsePaymentOutcome(payload.data);
}

/** E3: guest giữ sân 30% (public, không cookie/CSRF). */
export async function createGuestBooking(input: {
  courtId: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  idempotencyKey: string;
  signal?: AbortSignal;
}) {
  const signal = AbortSignal.any([
    AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    ...(input.signal ? [input.signal] : []),
  ]);
  const response = await fetch(`${API_BASE_URL}/api/guest/bookings`, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, prepaymentPercent: 30 }),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Không tạo được giữ chỗ khách vãng lai.',
    );
  }
  return payload.data as {
    bookingId: string;
    bookingCode: string;
    holdExpiresAt: string;
    totalAmount: number;
    prepaymentAmount: number;
    accessToken: string;
    accessTokenExpiresAt: string;
    serverNow: string;
  };
}

async function staffRequest(path: string, method: string, body?: unknown) {
  return request(path, method, body);
}

/** E14 staff thu số dư. amount chỉ stale-check phía server. */
export function staffCollectBalance(input: {
  bookingId: string;
  method: 'CASH' | 'MANUAL_BANK_TRANSFER';
  amount?: number;
  transactionReference?: string;
  idempotencyKey: string;
}) {
  return staffRequest('staff/payments/balance', 'POST', input);
}

/** E16 staff allocate receipt. */
export function staffAllocateReceipt(input: {
  receiptId: string;
  paymentRequestId: string;
  note?: string;
  idempotencyKey: string;
}) {
  return staffRequest(
    `staff/payments/receipts/${encodeURIComponent(input.receiptId)}/allocate`,
    'POST',
    {
      paymentRequestId: input.paymentRequestId,
      note: input.note,
      idempotencyKey: input.idempotencyKey,
    },
  );
}

/** E15 đối soát request với provider. */
export function staffReconcileRequest(requestId: string) {
  return staffRequest(
    `staff/payments/requests/${encodeURIComponent(requestId)}/reconcile`,
    'POST',
  );
}

/** E17 list refunds (MANAGER/ADMIN). */
export function staffListRefunds(query: { status?: string; bookingId?: string }) {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.bookingId) params.set('bookingId', query.bookingId);
  const suffix = params.toString() ? `?${params}` : '';
  return staffRequest(`staff/refunds${suffix}`, 'GET');
}

/** E18 approve + thu destination. */
export function staffApproveRefund(input: {
  refundId: string;
  note?: string;
  idempotencyKey: string;
  destination?: {
    destinationBankBin: string;
    destinationAccountLast4: string;
    destinationAccountName: string;
    destinationAccountNumber?: string;
  };
}) {
  const { refundId, ...body } = input;
  return staffRequest(
    `staff/refunds/${encodeURIComponent(refundId)}/approve`,
    'POST',
    body,
  );
}

/** E19 reject (reason bắt buộc). */
export function staffRejectRefund(input: {
  refundId: string;
  rejectionReason: string;
  idempotencyKey: string;
}) {
  const { refundId, ...body } = input;
  return staffRequest(
    `staff/refunds/${encodeURIComponent(refundId)}/reject`,
    'POST',
    body,
  );
}

/** E21 reveal destination (MANAGER, audit). */
export function staffRevealDestination(refundId: string) {
  return staffRequest(
    `staff/refunds/${encodeURIComponent(refundId)}/destination`,
    'GET',
  );
}

/** E22 reconcile refund manual. */
export function staffReconcileRefund(input: {
  refundId: string;
  bankTransactionReference?: string;
  evidenceReference?: string;
}) {
  const { refundId, ...body } = input;
  return staffRequest(
    `staff/refunds/${encodeURIComponent(refundId)}/reconcile`,
    'POST',
    body,
  );
}

/** E12 lookup booking (masked + audit). */
export function staffLookupBooking(query: string) {
  const params = new URLSearchParams({ query });
  return staffRequest(`staff/bookings/lookup?${params}`, 'GET');
}
