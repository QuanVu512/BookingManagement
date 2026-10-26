import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import {
  PaymentStore,
  type BookingMoneyView,
  type PaymentRequestDraft,
  type ReceiptIngest,
  type StoredPaymentRequest,
} from '../ports/payment-store.js';

function toStoredPaymentRequest(row: {
  id: string;
  paymentCode: string;
  referenceId: string;
  purpose: unknown;
  amount: { toString(): string };
  currency: string;
  method: unknown;
  provider: string | null;
  providerOrderCode: bigint | null;
  providerPaymentLinkId: string | null;
  checkoutUrl: string | null;
  vietQrPayload: string | null;
  expiresAt: Date | null;
  status: unknown;
  createdAt: Date;
}): StoredPaymentRequest {
  return {
    id: row.id,
    paymentCode: row.paymentCode,
    referenceId: row.referenceId,
    purpose: String(row.purpose),
    amount: Number(row.amount.toString()),
    currency: row.currency,
    method: String(row.method),
    provider: row.provider,
    providerOrderCode:
      row.providerOrderCode === null ? null : row.providerOrderCode.toString(),
    providerPaymentLinkId: row.providerPaymentLinkId,
    checkoutUrl: row.checkoutUrl,
    vietQrPayload: row.vietQrPayload,
    status: String(row.status),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaPaymentStore extends PaymentStore {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly transaction?: TransactionContext,
  ) {
    super();
  }

  withTransaction<Result>(
    work: (
      transaction: TransactionContext,
      store: PaymentStore,
    ) => Promise<Result>,
  ): Promise<Result> {
    return this.prisma.$transaction(
      (transaction) =>
        work(transaction, new PrismaPaymentStore(this.prisma, transaction)),
      PAYMENT_TRANSACTION_OPTIONS,
    );
  }

  async lockBookingMoney(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${bookingId}))`;
  }

  async databaseNow(transaction: TransactionContext): Promise<Date> {
    const [clock] = await transaction.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return clock.now;
  }

  async findRequestReplay(
    transaction: TransactionContext,
    idempotencyKey: string,
  ): Promise<StoredPaymentRequest | null> {
    const row = await transaction.paymentRequest.findUnique({
      where: { idempotencyKey },
    });
    return row ? toStoredPaymentRequest(row) : null;
  }

  async insertPaymentRequest(
    transaction: TransactionContext,
    draft: PaymentRequestDraft,
  ): Promise<StoredPaymentRequest> {
    const row = await transaction.paymentRequest.create({
      data: {
        paymentCode: draft.paymentCode,
        referenceType: draft.referenceType,
        referenceId: draft.referenceId,
        purpose: draft.purpose,
        amount: draft.amount,
        currency: draft.currency,
        method: draft.method,
        provider: draft.provider,
        providerChannelId: draft.providerChannelId,
        providerOrderCode: draft.providerOrderCode,
        providerPaymentLinkId: draft.providerPaymentLinkId,
        checkoutUrl: draft.checkoutUrl,
        vietQrPayload: draft.vietQrPayload,
        providerAccountName: draft.providerAccountName,
        providerBin: draft.providerBin,
        expiresAt: draft.expiresAt,
        createdByUserId: draft.createdByUserId,
        idempotencyKey: draft.idempotencyKey,
      },
    });
    return toStoredPaymentRequest(row);
  }

  async readPaymentRequest(
    transaction: TransactionContext,
    id: string,
  ): Promise<StoredPaymentRequest | null> {
    const row = await transaction.paymentRequest.findUnique({ where: { id } });
    return row ? toStoredPaymentRequest(row) : null;
  }

  async readBookingMoney(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<BookingMoneyView | null> {
    const booking = await transaction.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        userId: true,
        status: true,
        totalAmount: true,
        requiredPrepaymentAmount: true,
        holdExpiresAt: true,
      },
    });
    if (!booking) return null;
    const receipts = await transaction.paymentTransaction.findMany({
      where: {
        paymentRequest: { referenceId: bookingId },
        verificationStatus: 'VERIFIED',
        allocationStatus: 'ALLOCATED',
      },
      select: { amount: true, id: true },
    });
    const receiptIds = receipts.map((receipt) => receipt.id);
    const refunds =
      receiptIds.length === 0
        ? []
        : await transaction.refundRequest.findMany({
            where: {
              paymentTransactionId: { in: receiptIds },
              status: 'COMPLETED',
            },
            select: { amount: true },
          });
    return {
      bookingId: booking.id,
      userId: (booking as { userId?: string | null }).userId ?? null,
      status: String(booking.status),
      totalAmount: Number(booking.totalAmount.toString()),
      requiredPrepaymentAmount: Number(
        booking.requiredPrepaymentAmount.toString(),
      ),
      holdExpiresAt: booking.holdExpiresAt,
      allocatedReceiptAmounts: receipts.map((receipt) =>
        Number(receipt.amount.toString()),
      ),
      completedRefundAmounts: refunds.map((refund) =>
        Number(refund.amount.toString()),
      ),
    };
  }

  async findReceiptByCanonicalIdentity(
    transaction: TransactionContext,
    canonicalIdentity: string,
  ): Promise<{
    id: string;
    amount: number;
    receivingAccountKey: string;
  } | null> {
    const [accountKey, reference] = canonicalIdentity.split('::');
    if (!accountKey || !reference) return null;
    const row = await transaction.paymentTransaction.findFirst({
      where: {
        receivingAccountKey: accountKey,
        transactionReference: reference,
      },
      select: { id: true, amount: true, receivingAccountKey: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      amount: Number(row.amount.toString()),
      receivingAccountKey: row.receivingAccountKey,
    };
  }

  async insertReceipt(
    transaction: TransactionContext,
    ingest: ReceiptIngest,
  ): Promise<string> {
    // F04: thỏa CHECK verified_at/funds_received_at cho VERIFIED.
    const now = new Date();
    const row = await transaction.paymentTransaction.create({
      data: {
        paymentRequestId: ingest.paymentRequestId,
        provider: ingest.provider,
        method: ingest.method,
        receivingAccountKey: ingest.receivingAccountKey,
        transactionReference: ingest.transactionReference,
        amount: ingest.amount,
        currency: ingest.currency,
        verificationStatus: 'VERIFIED',
        verifiedAt: now,
        verifiedByUserId: ingest.recordedByUserId,
        allocationStatus: 'UNALLOCATED',
        confirmationSource: ingest.confirmationSource,
        fundsReceivedAt: ingest.fundsReceivedAt,
        recordedByUserId: ingest.recordedByUserId,
        idempotencyKey: ingest.idempotencyKey,
      },
    });
    return row.id;
  }

  async markRequestPaid(
    transaction: TransactionContext,
    requestId: string,
  ): Promise<void> {
    await transaction.paymentRequest.update({
      where: { id: requestId },
      data: { status: 'PAID' },
    });
  }
}
