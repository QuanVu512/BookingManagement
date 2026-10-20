/**
 * BE-PAY-06/08 — Server-derived outcome resolver (MIG-14).
 * MỘT resolver duy nhất cho booking/payment/money outcomes. FE không đoán
 * từ request enum; PAID + HOLDING không phải success; timer 0 chỉ refresh.
 */
export type ReviewReasonCode =
  | 'NONE'
  | 'LATE_PAYMENT_REVIEW'
  | 'OVERPAYMENT_REVIEW'
  | 'AMOUNT_MISMATCH_REVIEW'
  | 'REFUND_UNKNOWN_REVIEW'
  | 'REFUND_FAILED_REVIEW'
  | 'REFUND_DESTINATION_NEEDED';

export type PaymentScreen =
  | 'SCR04_SUCCESS'
  | 'SCR05_EXPIRED'
  | 'SCR06_REVIEW'
  | 'SCR_PENDING'
  | 'SCR_CANCELLED';

export interface OutcomeFacts {
  bookingStatus: string;
  requiredPrepaymentAmount: number;
  netCredited: number;
  hasRefundRequiredReceipt: boolean;
  hasUnknownOrFailedRefundAttempt: boolean;
  hasFailedRefund: boolean;
  needsRefundDestination: boolean;
}

export interface ResolvedOutcome {
  screen: PaymentScreen;
  reviewRequired: boolean;
  reviewReasonCode: ReviewReasonCode;
}

export function resolvePaymentOutcome(facts: OutcomeFacts): ResolvedOutcome {
  if (
    facts.hasRefundRequiredReceipt ||
    facts.hasUnknownOrFailedRefundAttempt ||
    facts.needsRefundDestination
  ) {
    let reason: ReviewReasonCode = 'LATE_PAYMENT_REVIEW';
    if (facts.hasFailedRefund) reason = 'REFUND_FAILED_REVIEW';
    else if (facts.hasUnknownOrFailedRefundAttempt)
      reason = 'REFUND_UNKNOWN_REVIEW';
    else if (facts.needsRefundDestination)
      reason = 'REFUND_DESTINATION_NEEDED';
    else if (facts.netCredited > facts.requiredPrepaymentAmount)
      reason = 'OVERPAYMENT_REVIEW';
    return { screen: 'SCR06_REVIEW', reviewRequired: true, reviewReasonCode: reason };
  }
  if (
    facts.bookingStatus === 'CONFIRMED' &&
    facts.netCredited >= facts.requiredPrepaymentAmount &&
    facts.requiredPrepaymentAmount > 0
  ) {
    return { screen: 'SCR04_SUCCESS', reviewRequired: false, reviewReasonCode: 'NONE' };
  }
  if (facts.bookingStatus === 'EXPIRED') {
    return { screen: 'SCR05_EXPIRED', reviewRequired: false, reviewReasonCode: 'NONE' };
  }
  if (facts.bookingStatus === 'CANCELLED') {
    return { screen: 'SCR_CANCELLED', reviewRequired: false, reviewReasonCode: 'NONE' };
  }
  return { screen: 'SCR_PENDING', reviewRequired: false, reviewReasonCode: 'NONE' };
}
