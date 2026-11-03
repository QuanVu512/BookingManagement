import {
  API_BASE_URL,
  AUTH_REQUEST_TIMEOUT_MS,
} from '../../../constants/network';
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
  checkoutToken?: string,
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
  if (checkoutToken) {
    // CheckoutRecoveryToken: chỉ đọc recovery và tạo PREPAYMENT cho đúng đơn
    // đã bind; không mở quyền manage/refund.
    headers['X-Booking-Checkout-Token'] = checkoutToken;
  }
  const omitCredentials = Boolean(guestToken || checkoutToken);
  if (method !== 'GET') {
    headers['X-CSRF-Token'] = await csrfToken(signal);
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${API_BASE_URL}/api/${path}`, {
    method,
    credentials: omitCredentials ? 'omit' : 'include',
    cache: 'no-store',
    signal,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload: unknown = response.status === 204 ? {} : await response.json();
  if (!response.ok) {
    const code =
      isRecord(payload) &&
      isRecord(payload.error) &&
      typeof payload.error.code === 'string'
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
      return request(
        path,
        method,
        body,
        caller,
        true,
        guestToken,
        checkoutToken,
      );
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
  guestToken?: string;
}) {
  const path = input.guestToken
    ? 'guest/payments/requests'
    : 'payments/requests';
  const payload = await request(
    path,
    'POST',
    {
      bookingId: input.bookingId,
      purpose: input.purpose,
      prepaymentPercent: input.prepaymentPercent ?? 30,
      method: input.method,
      idempotencyKey: input.idempotencyKey,
    },
    input.signal,
    false,
    input.guestToken,
  );
  return parsePaymentRequest(payload.data);
}

/**
 * S5-01 — tạo yêu cầu thu PREPAYMENT bằng CheckoutRecoveryToken (tab sạch từ
 * email, không có ManageToken). Server bind token đúng booking, chỉ cho tạo
 * trong cửa sổ giữ chỗ còn hạn, khóa idempotency chuẩn của booking.
 */
export async function createGuestPrepaymentRequest(input: {
  bookingId: string;
  prepaymentPercent?: 30;
  method?: 'PAYOS_TRANSFER';
  signal?: AbortSignal;
  checkoutToken: string;
}) {
  const payload = await request(
    `guest/bookings/${encodeURIComponent(input.bookingId)}/payment-requests`,
    'POST',
    {
      prepaymentPercent: input.prepaymentPercent ?? 30,
      method: input.method ?? 'PAYOS_TRANSFER',
    },
    input.signal,
    false,
    undefined,
    input.checkoutToken,
  );
  return parsePaymentRequest(payload.data);
}

export async function getPaymentRequest(
  id: string,
  signal?: AbortSignal,
  guestToken?: string,
) {
  const path = guestToken
    ? `guest/payments/requests/${encodeURIComponent(id)}`
    : `payments/requests/${encodeURIComponent(id)}`;
  const payload = await request(
    path,
    'GET',
    undefined,
    signal,
    false,
    guestToken,
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
  guestToken?: string,
) {
  const path = guestToken
    ? `guest/payments/requests/${encodeURIComponent(requestId)}/status`
    : `payments/requests/${encodeURIComponent(requestId)}/status`;
  const payload = await request(
    path,
    'GET',
    undefined,
    signal,
    false,
    guestToken,
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

export interface DemoSimulateResult {
  eventId: string;
  status: 'processed' | 'accepted';
  outcome: ReturnType<typeof parseNullablePaymentOutcome>;
}

/**
 * FE-PAY-DEMO — Gọi simulator showcase của server. Server authorize owner,
 * ký webhook demo và xử lý qua canonical receipt path; client chỉ poll
 * outcome sau đó, không tự kết luận thành công từ response này.
 */
export async function simulateDemoPayment(input: {
  requestId: string;
  orderCode?: string | null;
  signal?: AbortSignal;
  guestToken?: string;
  bookingId?: string;
}): Promise<DemoSimulateResult> {
  const payload = await request(
    'webhooks/payos/simulate',
    'POST',
    {
      ...(input.orderCode
        ? { orderCode: Number(input.orderCode) }
        : { requestId: input.requestId }),
      ...(input.guestToken ? { bookingId: input.bookingId } : {}),
    },
    input.signal,
    false,
    input.guestToken,
  );
  if (!isRecord(payload.data)) {
    throw new Error('Phản hồi mô phỏng không hợp lệ.');
  }
  const record = payload.data;
  if (typeof record.eventId !== 'string') {
    throw new Error('Phản hồi mô phỏng không hợp lệ.');
  }
  return {
    eventId: record.eventId,
    status: record.status === 'accepted' ? 'accepted' : 'processed',
    outcome: parseNullablePaymentOutcome(record.outcome ?? null),
  };
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

export interface GuestHoldRecoverySnapshot {
  booking: {
    id: string;
    code: string;
    courtId: string;
    courtName: string;
    courtCode: string;
    startsAt: string;
    endsAt: string;
    totalAmount: number;
    prepaymentAmount: number;
    status: string;
    holdExpiresAt: string;
  };
  serverClock: {
    serverNow: string;
    remainingHoldSeconds: number;
    isHoldExpired: boolean;
  };
  payment: {
    requestId: string;
    provider: string;
    status: string;
    amount: number;
    vietQrPayload?: string;
    checkoutUrl?: string;
    outcomeScreen: string;
    requiresReview: boolean;
  } | null;
  allowedActions: {
    canReadRecovery: boolean;
    canPay: boolean;
    canShowQr: boolean;
    canCreatePayment: boolean;
    canCancelHold: boolean;
    requiresReview: boolean;
    isHoldExpired: boolean;
  };
}

function readGuestCheckoutToken(bookingId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    // Token khôi phục lượt checkout; dự phòng token quản lý khi đơn được chia
    // sẻ qua link khôi phục chỉ mang một token.
    return (
      sessionStorage.getItem(`guest-checkout-token:${bookingId}`) ??
      sessionStorage.getItem(`guest-manage-token:${bookingId}`)
    );
  } catch {
    return null;
  }
}

/**
 * STEP4-P1-2 — Đọc snapshot phục hồi server-authoritative, CHỈ GET.
 * Dùng cho nút "Đọc lại trạng thái đơn" và mở lại QR từ cảnh báo pending:
 * tuyệt đối không POST tạo payment/retry trên đường này. Hết quyền đọc
 * (401/403) hoặc lỗi mạng giữ snapshot cũ và báo lỗi, không suy trạng thái.
 */
export async function getGuestHoldRecovery(
  bookingId: string,
  signal?: AbortSignal,
): Promise<GuestHoldRecoverySnapshot> {
  const token = readGuestCheckoutToken(bookingId);
  const headers: Record<string, string> = {};
  if (token) headers['X-Booking-Checkout-Token'] = token;
  const response = await fetch(
    `${API_BASE_URL}/api/guest/bookings/${encodeURIComponent(bookingId)}/recovery`,
    { method: 'GET', credentials: 'omit', cache: 'no-store', signal, headers },
  );
  const payload: unknown = await response.json();
  if (
    !response.ok ||
    !isRecord(payload) ||
    payload.success !== true ||
    !isRecord(payload.data)
  ) {
    const message =
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Chưa đọc được trạng thái đơn. Vui lòng thử lại.';
    throw new Error(message);
  }
  return payload.data as unknown as GuestHoldRecoverySnapshot;
}

/**
 * Task 5.3 — gửi yêu cầu tra cứu đơn giữ chỗ (SĐT hoặc email).
 * Máy chủ luôn trả cùng thông báo chung (AC-22), kể cả khi không có đơn
 * hoặc vượt giới hạn; không bao giờ lộ danh sách đơn/email ra màn hình.
 */
export async function requestGuestRecoveryLink(
  contact: string,
  signal?: AbortSignal,
): Promise<{ message: string }> {
  const payload = await request(
    'guest/bookings/lookup',
    'POST',
    { contact },
    signal,
  );
  const data = payload as { success: boolean; message?: unknown };
  if (typeof data.message !== 'string' || !data.message) {
    throw new Error('Phản hồi tra cứu không hợp lệ.');
  }
  return { message: data.message };
}

export interface GuestHoldCreatedResponse {
  bookingId: string;
  bookingCode: string;
  holdExpiresAt: string;
  totalAmount: number;
  prepaymentAmount: number;
  accessToken: string;
  accessTokenExpiresAt: string;
  checkoutToken: string;
  checkoutTokenExpiresAt: string;
  checkoutIntentId: string;
  paymentRequestId?: string | null;
  paymentStatus?: string | null;
  serverNow: string;
}

/**
 * E3: guest giữ sân 30% (public, không cookie/CSRF).
 * Bước 2: bắt buộc kèm `otpProof` từ verify-otp, `checkoutIntentId` và
 * `recoverySecret` đã sinh trước đó (Contract F1).
 */
export async function createGuestBooking(input: {
  courtId: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  idempotencyKey: string;
  otpProof: string;
  checkoutIntentId: string;
  recoverySecret: string;
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
    body: JSON.stringify({
      courtId: input.courtId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      customerEmail: input.customerEmail,
      idempotencyKey: input.idempotencyKey,
      otpProof: input.otpProof,
      checkoutIntentId: input.checkoutIntentId,
      recoverySecret: input.recoverySecret,
      prepaymentPercent: 30,
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Không tạo được giữ chỗ khách vãng lai.',
    );
  }
  return payload.data as GuestHoldCreatedResponse;
}

/** Gửi mã OTP xác thực email trước khi tạo đơn đặt sân khách vãng lai */
export async function sendGuestBookingOtp(email: string) {
  const signal = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  const response = await fetch(`${API_BASE_URL}/api/guest/bookings/send-otp`, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Không gửi được mã xác thực OTP qua email.',
    );
  }
  return payload as {
    success: true;
    message: string;
    resendAfterSeconds?: number;
  };
}

/** Xác thực mã OTP email khách vãng lai, trả proof một lần cho bước tạo hold. */
export async function verifyGuestBookingOtp(email: string, code: string) {
  const signal = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  const response = await fetch(
    `${API_BASE_URL}/api/guest/bookings/verify-otp`,
    {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok || !isRecord(payload) || payload.success !== true) {
    throw new Error(
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Mã OTP không chính xác hoặc đã hết hạn.',
    );
  }
  if (
    typeof payload.otpProof !== 'string' ||
    typeof payload.otpProofExpiresAt !== 'string'
  ) {
    throw new Error(
      'Máy chủ không trả mã xác thực email hợp lệ. Vui lòng thử lại.',
    );
  }
  return payload as {
    success: true;
    verified: true;
    message: string;
    otpProof: string;
    otpProofExpiresAt: string;
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
export function staffListRefunds(query: {
  status?: string;
  bookingId?: string;
}) {
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
