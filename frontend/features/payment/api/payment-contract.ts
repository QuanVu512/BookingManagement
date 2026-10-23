import type {
  PaymentOutcome,
  PaymentRequestRecord,
  PaymentScreen,
} from '../model/payment';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

/**
 * FE-PAY-02 — Lỗi request có cấu trúc (MIG-10/MIG-12).
 * Phân biệt CSRF 403 (refresh + retry một lần) với RBAC 403 (chặn).
 */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly errorCode: string | null;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(input: {
    message: string;
    status: number;
    errorCode?: string | null;
    retryAfterMs?: number | null;
  }) {
    super(input.message);
    this.name = 'ApiRequestError';
    this.status = input.status;
    this.errorCode = input.errorCode ?? null;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.retryable =
      input.status === 429 ||
      input.status >= 500 ||
      input.errorCode === 'PAYMENT_UNAVAILABLE';
  }

  isCsrf(): boolean {
    return this.status === 403 && this.errorCode === 'AUTH_CSRF';
  }
}

const REQUEST_STATUSES = [
  'CREATING',
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
];

export function isPaymentRequest(
  value: unknown,
): value is PaymentRequestRecord {
  return (
    isRecord(value) &&
    (value.vietQrPayload === undefined ||
      value.vietQrPayload === null ||
      typeof value.vietQrPayload === 'string') &&
    typeof value.id === 'string' &&
    typeof value.paymentCode === 'string' &&
    (value.purpose === 'PREPAYMENT' || value.purpose === 'BALANCE') &&
    typeof value.amount === 'number' &&
    Number.isFinite(value.amount) &&
    typeof value.currency === 'string' &&
    ['PAYOS_TRANSFER', 'MANUAL_BANK_TRANSFER', 'CASH'].includes(
      value.method as string,
    ) &&
    (value.providerOrderCode === null ||
      typeof value.providerOrderCode === 'string') &&
    (value.checkoutUrl === null || typeof value.checkoutUrl === 'string') &&
    REQUEST_STATUSES.includes(value.status as string) &&
    (value.expiresAt === null || typeof value.expiresAt === 'string') &&
    typeof value.reviewRequired === 'boolean' &&
    (value.reviewReasonCode === null ||
      typeof value.reviewReasonCode === 'string')
  );
}

export function parsePaymentRequest(value: unknown): PaymentRequestRecord {
  if (!isPaymentRequest(value))
    throw new Error('Thông tin thanh toán không hợp lệ. Hãy tải lại.');
  return value;
}

const SCREENS: PaymentScreen[] = [
  'SCR04_SUCCESS',
  'SCR05_EXPIRED',
  'SCR06_REVIEW',
  'SCR_PENDING',
  'SCR_CANCELLED',
];

export function parsePaymentOutcome(value: unknown): PaymentOutcome {
  if (!isPaymentOutcome(value))
    throw new Error('Trạng thái thanh toán không hợp lệ. Hãy tải lại.');
  return value as unknown as PaymentOutcome;
}

/** E6 trả `data: null` khi booking chưa có yêu cầu cho purpose đó. */
export function parseNullablePaymentOutcome(
  value: unknown,
): PaymentOutcome | null {
  return value === null ? null : parsePaymentOutcome(value);
}

export const REFUND_OUTCOMES = [
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
  'UNKNOWN',
  'FAILED',
  'PROCESSING',
] as const;

export interface RefundTrackerItem {
  id: string;
  status: string;
  amount: number;
  reasonType: string;
  outcomeCode: (typeof REFUND_OUTCOMES)[number];
  actionRequired: string | null;
  destinationAccountLast4: string | null;
  bankTransactionReference: string | null;
}

export function parseRefundTracker(value: unknown): RefundTrackerItem[] {
  if (!isRecord(value) || !Array.isArray(value.items))
    throw new Error('Thông tin hoàn tiền không hợp lệ. Hãy tải lại.');
  return value.items.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.status !== 'string' ||
      typeof item.amount !== 'number' ||
      !Number.isFinite(item.amount) ||
      typeof item.reasonType !== 'string' ||
      !REFUND_OUTCOMES.includes(
        item.outcomeCode as RefundTrackerItem['outcomeCode'],
      ) ||
      (item.actionRequired !== null &&
        typeof item.actionRequired !== 'string') ||
      (item.destinationAccountLast4 !== null &&
        typeof item.destinationAccountLast4 !== 'string') ||
      (item.bankTransactionReference !== null &&
        typeof item.bankTransactionReference !== 'string')
    )
      throw new Error('Thông tin hoàn tiền không hợp lệ. Hãy tải lại.');
    return item as unknown as RefundTrackerItem;
  });
}

function isPaymentOutcome(value: unknown): value is PaymentOutcome {
  return (
    isRecord(value) &&
    SCREENS.includes(value.screen as PaymentScreen) &&
    typeof value.reviewRequired === 'boolean' &&
    (value.reviewReasonCode === null ||
      typeof value.reviewReasonCode === 'string') &&
    typeof value.bookingStatus === 'string' &&
    typeof value.netCredited === 'number' &&
    typeof value.requiredPrepaymentAmount === 'number'
  );
}

/**
 * MIG-14 client guard: success chỉ khi server resolver ra SCR04.
 * PAID + HOLDING, timer hết, hay redirect return đều không tự success.
 */
export function isPaymentSuccess(outcome: PaymentOutcome): boolean {
  return (
    outcome.screen === 'SCR04_SUCCESS' &&
    !outcome.reviewRequired &&
    outcome.bookingStatus === 'CONFIRMED'
  );
}
