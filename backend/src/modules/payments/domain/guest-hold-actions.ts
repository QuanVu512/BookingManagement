import type { CheckoutRecoveryCapabilities } from './guest-checkout-token-policy.js';

/**
 * Contract F4 — action matrix server-authoritative cho màn hình recovery.
 * Tách "được tạo/khôi phục payment request" khỏi "QR đã sẵn sàng" để không
 * hiển thị QR khi provider còn CREATING, thiếu payload hoặc request đã chết.
 */
export type GuestHoldBookingStatus =
  | 'HOLDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'CHECKED_IN'
  | 'COMPLETED'
  | 'NO_SHOW';

export type GuestPaymentRequestStatus =
  | 'CREATING'
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export interface GuestPaymentFacts {
  status: GuestPaymentRequestStatus;
  hasQrPayload: boolean;
  requiresReview: boolean;
}

export interface GuestHoldActionFacts {
  bookingStatus: GuestHoldBookingStatus;
  serverNow: Date;
  holdExpiresAt: Date;
  payment: GuestPaymentFacts | null;
  capabilities: CheckoutRecoveryCapabilities;
}

export interface GuestHoldActions {
  canReadRecovery: boolean;
  canCreatePayment: boolean;
  canShowQr: boolean;
  canCancelHold: boolean;
  canPay: boolean;
  isHoldExpired: boolean;
  requiresReview: boolean;
}

function isQrReady(payment: GuestPaymentFacts | null): boolean {
  if (!payment || !payment.hasQrPayload) return false;
  return payment.status === 'PENDING' || payment.status === 'PARTIALLY_PAID';
}

function isPayableRequestMissingOrRecoverable(
  payment: GuestPaymentFacts | null,
): boolean {
  if (!payment) return true;
  // CREATING: gọi lại/reconcile cùng idempotency key, không tạo request thứ hai.
  // FAILED: cho phép thử tạo lại theo nút "Thử tạo lại mã QR".
  return payment.status === 'CREATING' || payment.status === 'FAILED';
}

function hasReceivedFunds(payment: GuestPaymentFacts | null): boolean {
  if (!payment) return false;
  return payment.status === 'PARTIALLY_PAID' || payment.status === 'PAID';
}

export function resolveGuestHoldActions(
  facts: GuestHoldActionFacts,
): GuestHoldActions {
  const nowMs = facts.serverNow.getTime();
  const isHoldExpired = nowMs >= facts.holdExpiresAt.getTime();
  const holdIsLive = facts.bookingStatus === 'HOLDING' && !isHoldExpired;
  const requiresReview = facts.payment?.requiresReview ?? false;
  const canReadRecovery = facts.capabilities.canReadTerminalSummary;
  const canCreatePayment =
    holdIsLive &&
    facts.capabilities.canMutateHold &&
    !requiresReview &&
    isPayableRequestMissingOrRecoverable(facts.payment);
  const canShowQr =
    holdIsLive &&
    canReadRecovery &&
    !requiresReview &&
    isQrReady(facts.payment);
  const canCancelHold =
    holdIsLive &&
    facts.capabilities.canMutateHold &&
    !requiresReview &&
    !hasReceivedFunds(facts.payment);
  return {
    canReadRecovery,
    canCreatePayment,
    canShowQr,
    canCancelHold,
    // canPay giữ nghĩa "khách còn có thể hoàn tất thanh toán": đúng khi phải
    // tạo/khôi phục payment request (null/CREATING/FAILED) hoặc QR đã sẵn
    // sàng. canPay=true không đồng nghĩa đã có QR; UI phải đọc canShowQr.
    canPay: canCreatePayment || canShowQr,
    isHoldExpired,
    requiresReview,
  };
}
