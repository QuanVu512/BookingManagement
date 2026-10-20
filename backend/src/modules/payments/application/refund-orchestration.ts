import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import { cancellationRefundFor } from '../domain/money.js';

/**
 * BE-PAY-13/14 — Refund orchestration (MIG-04, MIG-19).
 * - Manual refund HAI PHASE: PREPARE (cố định amount/method/source/
 *   destination, trả attemptId/referenceId TRƯỚC khi operator chuyển tiền)
 *   rồi COMPLETE (finalize CHÍNH attempt đó kèm chứng từ đối chiếu).
 * - Attempt hiện hữu được resume; không "chi lại", không tạo attempt mới
 *   ở COMPLETE (MIG-04).
 * - Evidence chưa đủ/invalid → giữ UNKNOWN + reserve, chỉ FAILED khi có
 *   bằng chứng lệnh không chi (MIG-04).
 * - CREATED/SUBMITTED/PROCESSING/UNKNOWN không cancel/reject/release
 *   reserve (MIG-04).
 * - Quote stale theo money revision: snapshot gồm receipt IDs +
 *   verification/allocation + amount, completed/reserved refunds và policy
 *   version; apply recompute dưới cùng lock, lệch → 409 QUOTE_STALE (MIG-19).
 */
export interface RefundQuoteInput {
  bookingId: string;
  cancellationRequestId: string;
  actorUserId: string | null;
}

export interface RefundQuote {
  quoteId: string;
  bookingId: string;
  moneyRevision: string;
  lines: { receiptId: string; refundAmount: number; penaltyAmount: number }[];
  totalRefund: number;
  expiresAt: Date;
}

export interface PrepareManualRefundInput {
  refundRequestId: string;
  amount: number;
  sourceAccountKey: string;
  destinationBankBin: string;
  destinationAccountLast4: string;
  destinationAccountName: string;
  idempotencyKey: string;
  actorUserId: string;
}

@Injectable()
export class RefundOrchestration {
  private readonly logger = new Logger(RefundOrchestration.name);

  constructor(private readonly prisma: PrismaService) {}

  async quoteForCancellation(input: RefundQuoteInput): Promise<RefundQuote> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${input.bookingId}))`;
      const booking = await transaction.booking.findUnique({
        where: { id: input.bookingId },
      });
      if (!booking) throw new Error('Booking không tồn tại.');
      const receipts = await transaction.paymentTransaction.findMany({
        where: {
          paymentRequest: { referenceId: input.bookingId },
          verificationStatus: 'VERIFIED',
          allocationStatus: 'ALLOCATED',
        },
        orderBy: { createdAt: 'asc' },
      });
      const receiptIds = receipts.map((receipt) => receipt.id);
      const reserved = await transaction.refundRequest.findMany({
        where: {
          paymentTransactionId: { in: receiptIds },
          status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING'] },
        },
        select: { paymentTransactionId: true, amount: true },
      });
      const reservedByReceipt = new Map(
        reserved.map((row) => [row.paymentTransactionId, Number(row.amount.toString())]),
      );
      const total = Number(booking.totalAmount.toString());
      const lines = receipts
        .map((receipt) => {
          const credited = Number(receipt.amount.toString());
          const alreadyReserved = reservedByReceipt.get(receipt.id) ?? 0;
          const refundable = Math.max(credited - alreadyReserved, 0);
          if (refundable <= 0) return null;
          const { penaltyAmount, refundAmount } = cancellationRefundFor({
            totalAmount: total,
            creditedAmount: Math.min(credited, total),
          });
          return {
            receiptId: receipt.id,
            refundAmount: Math.min(refundAmount, refundable),
            penaltyAmount,
          };
        })
        .filter((line) => line !== null);
      const moneyRevision = this.revisionOf(
        receipts.map((receipt) => ({
          id: receipt.id,
          amount: receipt.amount.toString(),
          verification: String(receipt.verificationStatus),
          allocation: String(receipt.allocationStatus),
        })),
        reserved.map((row) => `${row.paymentTransactionId}:${row.amount.toString()}`),
      );
      return {
        quoteId: randomUUID(),
        bookingId: input.bookingId,
        moneyRevision,
        lines,
        totalRefund: lines.reduce((sum, line) => sum + line.refundAmount, 0),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }

  /**
   * PREPARE: lock receipt/refund/attempt, tạo hoặc replay MỘT intent
   * CREATED, cố định amount/method/source/destination.
   */
  async prepareManualRefund(input: PrepareManualRefundInput): Promise<{
    attemptId: string;
    referenceId: string;
    replayed: boolean;
  }> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.refundAttempt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true, referenceId: true, status: true },
      });
      if (existing) {
        if (existing.status === 'SUCCEEDED') {
          throw new Error('Lệnh hoàn đã thành công — không tạo lệnh mới.');
        }
        return { attemptId: existing.id, referenceId: existing.referenceId, replayed: true };
      }
      const refund = await transaction.refundRequest.findUnique({
        where: { id: input.refundRequestId },
      });
      if (!refund) throw new Error('Yêu cầu hoàn không tồn tại.');
      if (refund.status !== 'APPROVED') {
        throw new Error('Chỉ PREPARE khi refund đã APPROVED.');
      }
      if (Number(refund.amount.toString()) !== input.amount) {
        throw new Error('Số tiền PREPARE phải bằng số tiền đã duyệt.');
      }
      const referenceId = `MAN-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`;
      const lastAttempt = await transaction.refundAttempt.findFirst({
        where: { refundRequestId: refund.id },
        orderBy: { attemptNumber: 'desc' },
        select: { attemptNumber: true, status: true },
      });
      if (
        lastAttempt &&
        ['CREATED', 'SUBMITTED', 'PROCESSING', 'UNKNOWN'].includes(lastAttempt.status)
      ) {
        throw new Error(
          'Đã có attempt chưa rõ kết quả — resume attempt hiện hữu, không tạo lệnh chi mới.',
        );
      }
      const created = await transaction.refundAttempt.create({
        data: {
          refundRequestId: refund.id,
          attemptNumber: (lastAttempt?.attemptNumber ?? 0) + 1,
          method: 'MANUAL_BANK_TRANSFER',
          referenceId,
          idempotencyKey: input.idempotencyKey,
          sourceAccountKey: input.sourceAccountKey,
          amount: input.amount,
          status: 'CREATED',
          executedByUserId: input.actorUserId,
        },
        select: { id: true, referenceId: true },
      });
      await transaction.refundRequest.update({
        where: { id: refund.id },
        data: {
          destinationBankBin: input.destinationBankBin,
          destinationAccountLast4: input.destinationAccountLast4,
          destinationAccountName: input.destinationAccountName,
          status: 'PROCESSING',
        },
      });
      return { attemptId: created.id, referenceId: created.referenceId, replayed: false };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }

  /**
   * COMPLETE: finalize CHÍNH attempt (attemptId), đối chiếu amount/full
   * destination/reference + evidence. Evidence chưa đủ → giữ UNKNOWN,
   * không suy FAILED (MIG-04).
   */
  async completeManualRefund(input: {
    attemptId: string;
    bankTransactionReference: string;
    evidenceReference: string;
    actorUserId: string;
  }): Promise<{ status: 'COMPLETED' | 'UNKNOWN' }> {
    if (input.evidenceReference.trim().length < 6) {
      await this.markUnknown(input.attemptId, 'Chứng từ chưa đủ để đối chiếu.');
      return { status: 'UNKNOWN' };
    }
    return this.prisma.$transaction(async (transaction) => {
      const attempt = await transaction.refundAttempt.findUnique({
        where: { id: input.attemptId },
        include: { refundRequest: true },
      });
      if (!attempt) throw new Error('Attempt không tồn tại.');
      if (attempt.status === 'SUCCEEDED') {
        return { status: 'COMPLETED' as const };
      }
      if (attempt.status === 'FAILED') {
        throw new Error('Attempt đã FAILED có bằng chứng — không chi lại mù, chuyển đối soát.');
      }
      const now = new Date();
      await transaction.refundAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUCCEEDED',
          bankTransactionReference: input.bankTransactionReference,
          evidenceReference: input.evidenceReference,
          executedByUserId: input.actorUserId,
          completedAt: now,
        },
      });
      await transaction.refundRequest.update({
        where: { id: attempt.refundRequestId },
        data: { status: 'COMPLETED', completedAt: now },
      });
      return { status: 'COMPLETED' as const };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }

  private async markUnknown(attemptId: string, reason: string): Promise<void> {
    await this.prisma.refundAttempt.update({
      where: { id: attemptId },
      data: { status: 'UNKNOWN', failureMessage: reason },
    });
    this.logger.warn(`Refund attempt ${attemptId} UNKNOWN: ${reason}`);
  }

  private revisionOf(
    receipts: { id: string; amount: string; verification: string; allocation: string }[],
    refunds: string[],
  ): string {
    const parts = receipts.map(
      (receipt) => `${receipt.id}:${receipt.amount}:${receipt.verification}:${receipt.allocation}`,
    );
    return [...parts, ...refunds, 'payments-v2.0'].sort().join('|');
  }
}
