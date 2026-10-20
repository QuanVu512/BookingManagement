import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  canAllocateWholeReceipt,
  summarizeBookingMoney,
} from '../domain/money.js';
import { PayosSignatureService } from '../infrastructure/payos-signature.service.js';
import {
  PaymentStore,
  type StoredPaymentRequest,
} from '../ports/payment-store.js';
import { BookingConfirmationCoordinator } from './booking-confirmation-coordinator.js';

/**
 * BE-PAY-10 — Verify + allocate receipt, điều phối confirm booking
 * (MIG-01, MIG-02, MIG-03, MIG-06).
 * - Một transaction: advisory booking-money → recheck state → canonical
 *   identity dedup → insert VERIFIED → allocate hoặc REFUND_REQUIRED →
 *   confirm khi đủ điều kiện → history/outbox cùng tx.
 * - decidedAt lấy SAU lock (clock_timestamp); confirm chỉ khi HOLDING và
 *   decidedAt < holdExpiresAt (MIG-01 half-open).
 * - Conflict cùng identity khác amount/account → quarantine, không sinh
 *   tiền thứ hai (MIG-06).
 */
export interface VerifiedFunds {
  receivingAccountKey: string;
  transactionReference: string | null;
  amount: number;
  currency: string;
  fundsReceivedAt: Date;
  paymentRequestId: string | null;
  confirmationSource: 'WEBHOOK' | 'PROVIDER_QUERY' | 'STAFF';
  recordedByUserId: string | null;
}

export interface AllocationResult {
  receiptId: string;
  status: 'ALLOCATED' | 'REFUND_REQUIRED' | 'DUPLICATE';
  /** true khi booking đã CONFIRMED (vừa confirm hoặc đã confirm trước đó
   *  bởi concurrent worker); false khi không đủ điều kiện / đã hết hạn.
   *  Không bao giờ suy success từ return URL hay redirect. */
  confirmEligible: boolean;
}

@Injectable()
export class VerifyReceiptUseCase {
  private readonly logger = new Logger(VerifyReceiptUseCase.name);

  constructor(
    private readonly payments: PaymentStore,
    private readonly signatures: PayosSignatureService,
    @Optional() private readonly coordinator?: BookingConfirmationCoordinator,
  ) {}

  async execute(
    bookingId: string,
    funds: VerifiedFunds,
    idempotencyKey: string,
  ): Promise<AllocationResult> {
    const allocated = await this.payments.withTransaction((transaction, store) =>
      this.allocateInTransaction(transaction, store, bookingId, funds, idempotencyKey),
    );
    // Confirm ở tx riêng sau allocate: advisory lock serialize với concurrent
    // confirmer/expirer; conditional update chống double-confirm (BE-PAY-11).
    if (allocated.status === 'ALLOCATED' && this.coordinator) {
      const confirmation = await this.coordinator.confirmIfEligible(bookingId);
      return {
        ...allocated,
        confirmEligible: confirmation.result !== 'NOT_ELIGIBLE',
      };
    }
    return allocated;
  }

  private async allocateInTransaction(
    transaction: import('../../../infrastructure/prisma/transaction-context.js').TransactionContext,
    store: PaymentStore,
    bookingId: string,
    funds: VerifiedFunds,
    idempotencyKey: string,
  ): Promise<AllocationResult> {
    await store.lockBookingMoney(transaction, bookingId);
    const decidedAt = await store.databaseNow(transaction);

    const money = await store.readBookingMoney(transaction, bookingId);
    if (!money) throw new Error('Booking không tồn tại.');

    // Canonical identity dedup (MIG-06). CASH không có reference: dùng
    // idempotencyKey làm identity phụ với key riêng.
    const canonical =
      funds.transactionReference != null
        ? this.signatures.canonicalIdentity({
            receivingAccountKey: funds.receivingAccountKey,
            transactionReference: funds.transactionReference,
          })
        : `CASH::${idempotencyKey}`;
    const duplicate = await store.findReceiptByCanonicalIdentity(
      transaction,
      canonical,
    );
    if (duplicate) {
      if (duplicate.amount !== funds.amount) {
        // Quarantine conflict: giữ nguyên, báo để đối soát, không credit.
        this.logger.warn(
          `Receipt conflict on ${canonical}: existing ${duplicate.amount}, incoming ${funds.amount}.`,
        );
        throw new Error(
          'Khoản tiền trùng reference nhưng lệch số tiền — đã chuyển đối soát, không ghi nhận thêm.',
        );
      }
      return { receiptId: duplicate.id, status: 'DUPLICATE', confirmEligible: false };
    }

    const receiptId = await store.insertReceipt(transaction, {
      paymentRequestId: funds.paymentRequestId,
      provider: funds.confirmationSource === 'STAFF' ? null : 'PAYOS',
      method: funds.confirmationSource === 'STAFF' && funds.transactionReference == null ? 'CASH' : 'BANK_TRANSFER',
      receivingAccountKey: funds.receivingAccountKey,
      transactionReference: funds.transactionReference,
      amount: funds.amount,
      currency: funds.currency,
      confirmationSource: funds.confirmationSource,
      fundsReceivedAt: funds.fundsReceivedAt,
      recordedByUserId: funds.recordedByUserId,
      idempotencyKey,
      canonicalIdentity: canonical,
    });

    const summary = summarizeBookingMoney({
      totalAmount: money.totalAmount,
      allocatedReceiptAmounts: money.allocatedReceiptAmounts,
      completedRefundAmounts: money.completedRefundAmounts,
    });

    // MIG-03: chỉ allocate toàn bộ khi không vượt nghĩa vụ còn lại.
    if (!canAllocateWholeReceipt(funds.amount, summary.balanceDue)) {
      await transaction.paymentTransaction.update({
        where: { id: receiptId },
        data: { allocationStatus: 'REFUND_REQUIRED', reviewReason: 'OVERPAYMENT_REVIEW' },
      });
      return { receiptId, status: 'REFUND_REQUIRED', confirmEligible: false };
    }

    await transaction.paymentTransaction.update({
      where: { id: receiptId },
      data: { allocationStatus: 'ALLOCATED' },
    });

    // MIG-01/MIG-14: confirm-eligibility theo snapshot server, decidedAt
    // lấy sau lock. Transition booking do coordinator thực hiện cùng tx.
    const netAfter = summary.netCredited + funds.amount;
    const confirmEligible =
      money.status === 'HOLDING' &&
      money.holdExpiresAt !== null &&
      decidedAt < money.holdExpiresAt &&
      netAfter >= money.requiredPrepaymentAmount &&
      money.requiredPrepaymentAmount > 0;
    return { receiptId, status: 'ALLOCATED', confirmEligible };
  }

  async readRequest(
    requestId: string,
  ): Promise<StoredPaymentRequest | null> {
    return this.payments.withTransaction((transaction, store) =>
      store.readPaymentRequest(transaction, requestId),
    );
  }
}
