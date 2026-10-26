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
    // BLK-01: allocate + confirm/expiry-routing trong MỘT tx nguyên tử dưới
    // advisory lock — không còn cửa sổ crash/expiry giữa 2 tx.
    return this.payments.withTransaction((transaction, store) =>
      this.allocateInTransaction(transaction, store, bookingId, funds, idempotencyKey),
    );
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
      // Idempotent replay: thử confirm trong cùng tx nếu đủ điều kiện.
      const dupSummary = summarizeBookingMoney({
        totalAmount: money.totalAmount,
        allocatedReceiptAmounts: money.allocatedReceiptAmounts,
        completedRefundAmounts: money.completedRefundAmounts,
      });
      const dupEligible =
        money.status === 'HOLDING' &&
        money.holdExpiresAt !== null &&
        decidedAt < money.holdExpiresAt &&
        dupSummary.netCredited >= money.requiredPrepaymentAmount &&
        money.requiredPrepaymentAmount > 0;
      if (dupEligible) {
        const dupRow = await transaction.booking.findUnique({
          where: { id: bookingId },
          select: { version: true },
        });
        const dupChanged = await transaction.booking.updateMany({
          where: {
            id: bookingId,
            status: 'HOLDING',
            version: dupRow?.version ?? 0,
            holdExpiresAt: { gt: decidedAt },
          },
          data: { status: 'CONFIRMED', confirmedAt: decidedAt, version: { increment: 1 } },
        });
        if (dupChanged.count) {
          await transaction.bookingStatusHistory.create({
            data: {
              bookingId,
              fromStatus: 'HOLDING',
              toStatus: 'CONFIRMED',
              actorType: 'SYSTEM',
              reason: 'Đủ tiền trả trước đã xác minh (replay).',
            },
          });
          await transaction.outboxEvent.create({
            data: {
              aggregateType: 'BOOKING',
              aggregateId: bookingId,
              eventType: 'booking.confirmed',
              payload: { bookingId },
            },
          });
          return { receiptId: duplicate.id, status: 'DUPLICATE', confirmEligible: true };
        }
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

    // BLK-D: booking terminal (EXPIRED/CANCELLED) → không ALLOCATED; tạo
    // obligation REFUND_REQUIRED idempotent để đối soát hoàn.
    if (money.status === 'EXPIRED' || money.status === 'CANCELLED') {
      await transaction.paymentTransaction.update({
        where: { id: receiptId },
        data: { allocationStatus: 'REFUND_REQUIRED', reviewReason: 'LATE_PAYMENT_REVIEW' },
      });
      const key = `late-payment:${receiptId}`;
      const existingRefund = await transaction.refundRequest.findUnique({
        where: { idempotencyKey: key },
        select: { id: true },
      });
      if (!existingRefund) {
        await transaction.refundRequest.create({
          data: {
            paymentTransactionId: receiptId,
            reasonType: 'LATE_PAYMENT',
            reason: 'Tiền về sau khi booking kết thúc — chờ đối soát hoàn.',
            amount: funds.amount,
            currency: funds.currency,
            method: 'MANUAL_BANK_TRANSFER',
            status: 'REQUESTED',
            idempotencyKey: key,
          },
        });
      }
      return { receiptId, status: 'REFUND_REQUIRED', confirmEligible: false };
    }

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

    // MIG-01/MIG-14 + BLK-01: confirm-eligibility và transition CONFIRMED
    // trong CÙNG tx (conditional update + history + outbox).
    const netAfter = summary.netCredited + funds.amount;
    const confirmEligible =
      money.status === 'HOLDING' &&
      money.holdExpiresAt !== null &&
      decidedAt < money.holdExpiresAt &&
      netAfter >= money.requiredPrepaymentAmount &&
      money.requiredPrepaymentAmount > 0;
    if (!confirmEligible) {
      return { receiptId, status: 'ALLOCATED', confirmEligible: false };
    }
    const bookingRow = await transaction.booking.findUnique({
      where: { id: bookingId },
      select: { version: true, status: true, holdExpiresAt: true },
    });
    const changed = await transaction.booking.updateMany({
      where: {
        id: bookingId,
        status: 'HOLDING',
        version: bookingRow?.version ?? 0,
        holdExpiresAt: { gt: decidedAt },
      },
      data: { status: 'CONFIRMED', confirmedAt: decidedAt, version: { increment: 1 } },
    });
    if (!changed.count) {
      return { receiptId, status: 'ALLOCATED', confirmEligible: false };
    }
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId,
        fromStatus: 'HOLDING',
        toStatus: 'CONFIRMED',
        actorType: 'SYSTEM',
        reason: 'Đủ tiền trả trước đã xác minh.',
      },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateType: 'BOOKING',
        aggregateId: bookingId,
        eventType: 'booking.confirmed',
        payload: { bookingId },
      },
    });
    return { receiptId, status: 'ALLOCATED', confirmEligible: true };
  }

  async readRequest(
    requestId: string,
  ): Promise<StoredPaymentRequest | null> {
    return this.payments.withTransaction((transaction, store) =>
      store.readPaymentRequest(transaction, requestId),
    );
  }
}
