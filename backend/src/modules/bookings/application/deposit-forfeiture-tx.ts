import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PaymentAuditLogger } from '../../payments/infrastructure/payment-audit-logger.js';
import { quoteDepositForfeiture } from '../domain/deposit-forfeiture.js';

export interface DepositForfeitureTxInput {
  booking: {
    id: string;
    bookingCode: string;
    version: number;
    totalAmount: number;
  };
  decidedAt: Date;
  /** NO_SHOW (auto/D03) hoặc CANCELLED (staff late-cancel/D16). */
  toStatus: 'NO_SHOW' | 'CANCELLED';
  actorType: 'STAFF' | 'SYSTEM';
  actorUserId: string | null;
  historyReason: string;
  policyVersion: string;
  policyText: string;
  eventType: 'booking.no_show' | 'booking.cancelled';
  /** Namespace khóa idempotency cho refund lines (`noshow`/`late-cancel`). */
  refundKeyPrefix: string;
  /** Khóa idempotency cho bản ghi forfeiture (replay-safe). */
  requestKey: string;
}

export interface DepositForfeitureTxResult {
  bookingId: string;
  bookingCode: string;
  status: 'NO_SHOW' | 'CANCELLED';
  forfeitureRequestId: string;
  forfeitedDeposit: number;
  totalRefund: number;
  refundRequestIds: string[];
  replayed: boolean;
}

/**
 * D16 — Áp tịch thu deposit + nghĩa vụ hoàn trong MỘT tx.
 * - CAS CONFIRMED→toStatus theo version: cùng booking không bao giờ vừa
 *   CANCELLED vừa NO_SHOW (kẻ thua race nhận CONCURRENT_TRANSITION).
 * - Refund lines chỉ REQUESTED/MANUAL (không COMPLETED trước settlement).
 * - reasonType dùng CUSTOMER_CANCELLATION sẵn có (không thêm enum = không
 *   migration); trigger thật ghi trong reason/audit detail.
 */
export async function applyDepositForfeitureTx(
  tx: Prisma.TransactionClient,
  audit: PaymentAuditLogger,
  input: DepositForfeitureTxInput,
): Promise<DepositForfeitureTxResult> {
  const replay = await tx.bookingCancellationRequest.findUnique({
    where: { idempotencyKey: input.requestKey },
  });
  if (replay) {
    const refunds = await tx.refundRequest.findMany({
      where: { cancellationRequestId: replay.id },
      select: { id: true },
    });
    return {
      bookingId: input.booking.id,
      bookingCode: input.booking.bookingCode,
      status: input.toStatus,
      forfeitureRequestId: replay.id,
      forfeitedDeposit: Number(replay.penaltyAmount.toString()),
      totalRefund: Number(replay.refundAmount.toString()),
      refundRequestIds: refunds.map((row) => row.id),
      replayed: true,
    };
  }

  const receipts = await tx.paymentTransaction.findMany({
    where: {
      paymentRequest: { referenceId: input.booking.id },
      verificationStatus: 'VERIFIED',
      allocationStatus: 'ALLOCATED',
    },
    orderBy: { createdAt: 'asc' },
  });
  const holds = await tx.refundRequest.findMany({
    where: {
      paymentTransactionId: { in: receipts.map((receipt) => receipt.id) },
      status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'] },
    },
    select: { paymentTransactionId: true, amount: true, status: true },
  });
  const reservedByReceipt: Record<string, number> = {};
  const completedByReceipt: Record<string, number> = {};
  for (const row of holds) {
    const key = String(row.paymentTransactionId);
    const amount = Number(row.amount.toString());
    if (String(row.status) === 'COMPLETED') {
      completedByReceipt[key] = (completedByReceipt[key] ?? 0) + amount;
    } else {
      reservedByReceipt[key] = (reservedByReceipt[key] ?? 0) + amount;
    }
  }
  const quote = quoteDepositForfeiture({
    totalAmount: input.booking.totalAmount,
    receipts: receipts.map((receipt) => ({
      receiptId: receipt.id,
      creditedAmount: Number(receipt.amount.toString()),
    })),
    reservedByReceipt,
    completedByReceipt,
  });
  const paid = receipts.reduce(
    (sum, receipt) => sum + Number(receipt.amount.toString()),
    0,
  );
  const completedSum = Object.values(completedByReceipt).reduce(
    (sum, value) => sum + value,
    0,
  );
  const reservedSum = Object.values(reservedByReceipt).reduce(
    (sum, value) => sum + value,
    0,
  );
  const revision = createHash('sha256')
    .update(
      [
        `booking:${input.booking.id}:v${input.booking.version}`,
        `paid:${paid}`,
        `reserved:${reservedSum}`,
        `completed:${completedSum}`,
        `deposit:${quote.depositAmount}`,
        input.policyVersion,
      ].join('|'),
    )
    .digest('hex');

  const changed = await tx.booking.updateMany({
    where: {
      id: input.booking.id,
      status: 'CONFIRMED',
      version: input.booking.version,
    },
    data: {
      status: input.toStatus,
      ...(input.toStatus === 'CANCELLED'
        ? { cancelledAt: input.decidedAt }
        : {}),
      version: { increment: 1 },
    },
  });
  if (!changed.count) {
    throw new ConflictException({
      code: 'CONCURRENT_TRANSITION',
      message: 'Đơn vừa thay đổi — hãy tải lại và thử lại.',
    });
  }
  await tx.courtOccupancy.updateMany({
    where: { bookingId: input.booking.id, state: 'ACTIVE' },
    data: { state: 'RELEASED', releasedAt: input.decidedAt },
  });
  await tx.bookingStatusHistory.create({
    data: {
      bookingId: input.booking.id,
      fromStatus: 'CONFIRMED',
      toStatus: input.toStatus,
      actorType: input.actorType,
      actorUserId: input.actorUserId,
      reason: input.historyReason,
    },
  });

  const forfeiture = await tx.bookingCancellationRequest.create({
    data: {
      bookingId: input.booking.id,
      bookingVersion: input.booking.version,
      totalAmountSnapshot: input.booking.totalAmount,
      paidAmountSnapshot: paid,
      refundedAmountSnapshot: completedSum,
      reservedRefundAmountSnapshot: reservedSum,
      penaltyPercent: 30,
      penaltyAmount: quote.forfeitedAmount,
      refundAmount: quote.totalRefund,
      currency: 'VND',
      policyVersion: input.policyVersion,
      policyTextSnapshot: input.policyText,
      paymentSnapshotRevision: revision,
      actorType: input.actorType,
      requestedByUserId: input.actorUserId,
      reason: input.historyReason,
      status: 'APPLIED',
      expiresAt: input.decidedAt,
      acceptedAt: input.decidedAt,
      appliedAt: input.decidedAt,
      idempotencyKey: input.requestKey,
    },
  });

  const refundRequestIds: string[] = [];
  for (const line of quote.lines) {
    if (line.refundAmount <= 0) continue;
    const key = `${input.refundKeyPrefix}:${forfeiture.id}:${line.receiptId}`;
    const existingRefund = await tx.refundRequest.findUnique({
      where: { idempotencyKey: key },
      select: { id: true },
    });
    if (existingRefund) {
      refundRequestIds.push(existingRefund.id);
      continue;
    }
    const created = await tx.refundRequest.create({
      data: {
        paymentTransactionId: line.receiptId,
        cancellationRequestId: forfeiture.id,
        reasonType: 'CUSTOMER_CANCELLATION',
        reason: `${input.historyReason} (forfeiture ${forfeiture.id}).`,
        amount: line.refundAmount,
        currency: 'VND',
        method: 'MANUAL_BANK_TRANSFER',
        status: 'REQUESTED',
        requestedByUserId: input.actorUserId,
        idempotencyKey: key,
      },
    });
    refundRequestIds.push(created.id);
  }

  await tx.outboxEvent.create({
    data: {
      aggregateType: 'BOOKING',
      aggregateId: input.booking.id,
      eventType: input.eventType,
      payload: {
        bookingId: input.booking.id,
        forfeitureRequestId: forfeiture.id,
        forfeitedDeposit: quote.forfeitedAmount,
        totalRefund: quote.totalRefund,
      },
    },
  });
  await audit.logInTransaction(tx, {
    actorType: input.actorType,
    actorUserId: input.actorUserId,
    action: 'reconcile',
    entityType: 'booking',
    entityId: input.booking.id,
    result: 'OK',
    detail: {
      trigger:
        input.toStatus === 'NO_SHOW' ? 'NO_SHOW' : 'STAFF_LATE_CANCEL',
      forfeitureRequestId: forfeiture.id,
      depositAmount: quote.depositAmount,
      forfeitedDeposit: quote.forfeitedAmount,
      totalRefund: quote.totalRefund,
      refundRequestIds,
    },
  });

  return {
    bookingId: input.booking.id,
    bookingCode: input.booking.bookingCode,
    status: input.toStatus,
    forfeitureRequestId: forfeiture.id,
    forfeitedDeposit: quote.forfeitedAmount,
    totalRefund: quote.totalRefund,
    refundRequestIds,
    replayed: false,
  };
}
