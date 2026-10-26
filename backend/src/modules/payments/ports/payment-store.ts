import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';

/**
 * BE-PAY-03 — PaymentStore port (MIG-01, MIG-13).
 * Mọi writer tiền chạy trong MỘT transaction do caller sở hữu, theo thứ tự
 * lock: advisory booking-money → booking FOR UPDATE → requests/receipts/
 * refunds/attempts theo ID tăng. Không mở transaction lồng nhau.
 */
export interface PaymentRequestDraft {
  paymentCode: string;
  referenceType: 'BOOKING';
  referenceId: string;
  purpose: 'PREPAYMENT' | 'BALANCE';
  amount: number;
  currency: string;
  method: 'PAYOS_TRANSFER' | 'MANUAL_BANK_TRANSFER' | 'CASH';
  provider: string | null;
  providerChannelId: string | null;
  providerOrderCode: bigint | null;
  providerPaymentLinkId: string | null;
  checkoutUrl: string | null;
  vietQrPayload: string | null;
  providerAccountName: string | null;
  providerBin: string | null;
  expiresAt: Date | null;
  createdByUserId: string | null;
  idempotencyKey: string;
}

export interface StoredPaymentRequest {
  id: string;
  paymentCode: string;
  referenceId: string;
  purpose: string;
  amount: number;
  currency: string;
  method: string;
  provider: string | null;
  providerOrderCode: string | null;
  providerPaymentLinkId: string | null;
  checkoutUrl: string | null;
  vietQrPayload: string | null;
  status: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ReceiptIngest {
  paymentRequestId: string | null;
  provider: string | null;
  method: 'BANK_TRANSFER' | 'CASH';
  receivingAccountKey: string;
  transactionReference: string | null;
  amount: number;
  currency: string;
  confirmationSource: 'WEBHOOK' | 'PROVIDER_QUERY' | 'STAFF';
  fundsReceivedAt: Date;
  recordedByUserId: string | null;
  idempotencyKey: string;
  canonicalIdentity: string;
}

export interface BookingMoneyView {
  bookingId: string;
  userId?: string | null;
  status: string;
  totalAmount: number;
  requiredPrepaymentAmount: number;
  holdExpiresAt: Date | null;
  allocatedReceiptAmounts: number[];
  completedRefundAmounts: number[];
}

export abstract class PaymentStore {
  abstract withTransaction<Result>(
    work: (
      transaction: TransactionContext,
      store: PaymentStore,
    ) => Promise<Result>,
  ): Promise<Result>;

  /** Advisory lock tiền theo booking — bước đầu của LOCK-ORDER (MIG-01). */
  abstract lockBookingMoney(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<void>;

  abstract databaseNow(transaction: TransactionContext): Promise<Date>;

  abstract findRequestReplay(
    transaction: TransactionContext,
    idempotencyKey: string,
  ): Promise<StoredPaymentRequest | null>;

  abstract insertPaymentRequest(
    transaction: TransactionContext,
    draft: PaymentRequestDraft,
  ): Promise<StoredPaymentRequest>;

  abstract readPaymentRequest(
    transaction: TransactionContext,
    id: string,
  ): Promise<StoredPaymentRequest | null>;

  abstract readBookingMoney(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<BookingMoneyView | null>;

  abstract findReceiptByCanonicalIdentity(
    transaction: TransactionContext,
    canonicalIdentity: string,
  ): Promise<{ id: string; amount: number; receivingAccountKey: string } | null>;

  abstract insertReceipt(
    transaction: TransactionContext,
    ingest: ReceiptIngest,
  ): Promise<string>;

  abstract markRequestPaid(
    transaction: TransactionContext,
    requestId: string,
  ): Promise<void>;
}
