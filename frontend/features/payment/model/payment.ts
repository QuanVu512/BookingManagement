/**
 * FE-PAY-02 — Payment domain types (MIG-10 canonical DTO).
 * Mọi tên trường khớp backend: prepaymentPercent, prepaymentAmount,
 * balanceAmount, paymentSummary, cancellationQuote. Không hardcode 45k.
 */
export type PaymentPurpose = 'PREPAYMENT' | 'BALANCE';
export type PaymentMethod = 'PAYOS_TRANSFER' | 'MANUAL_BANK_TRANSFER' | 'CASH';
export type PaymentRequestStatus =
  | 'CREATING'
  | 'PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';

export interface PaymentRequestRecord {
  vietQrPayload?: string | null;
  id: string;
  paymentCode: string;
  purpose: PaymentPurpose;
  amount: number;
  currency: string;
  method: PaymentMethod;
  providerOrderCode: string | null;
  checkoutUrl: string | null;
  status: PaymentRequestStatus;
  expiresAt: string | null;
  reviewRequired: boolean;
  reviewReasonCode: string | null;
}

export type PaymentScreen =
  | 'SCR04_SUCCESS'
  | 'SCR05_EXPIRED'
  | 'SCR06_REVIEW'
  | 'SCR_PENDING'
  | 'SCR_CANCELLED';

export interface PaymentOutcome {
  serverNow?: string;
  screen: PaymentScreen;
  reviewRequired: boolean;
  reviewReasonCode: string | null;
  bookingStatus: string;
  netCredited: number;
  requiredPrepaymentAmount: number;
}
