import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import { summarizeBookingMoney } from '../domain/money.js';

export type ConfirmOutcome =
  | { result: 'CONFIRMED' }
  | { result: 'ALREADY_CONFIRMED' }
  | { result: 'NOT_ELIGIBLE'; reason: string };

export type ExitOutcome =
  | { result: 'EXPIRED'; obligationsCreated: number }
  | { result: 'ALREADY_FINAL'; status: string }
  | { result: 'CONFIRMED_INSTEAD' };

/**
 * BE-PAY-11 — Điều phối confirm + exit nguyên tử (MIG-01, MIG-05).
 * - Mọi writer: advisory booking-money → decidedAt = clock_timestamp SAU lock.
 * - Confirm: conditional update HOLDING + version CAS + decidedAt < hold →
 *   CONFIRMED + history + outbox cùng tx. Không bao giờ revive
 *   EXPIRED/CANCELLED; double-confirm an toàn qua CAS (lần 2 → ALREADY_*).
 * - Exit: conditional update HOLDING + decidedAt >= hold → EXPIRED, release
 *   đúng occupancy ACTIVE của booking này, giữ receipt evidence, tạo refund
 *   obligation LATE_PAYMENT idempotent cho receipt credited (MIG-05).
 * - Không gọi provider trong tx; Redis (nếu có) chỉ là trigger, PostgreSQL
 *   là source of truth (không dựa Redis lock cho correctness).
 */
@Injectable()
export class BookingConfirmationCoordinator {
  private readonly logger = new Logger(BookingConfirmationCoordinator.name);

  constructor(private readonly prisma: PrismaService) {}

  async confirmIfEligible(bookingId: string): Promise<ConfirmOutcome> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${bookingId}))`;
      const [clock] = await transaction.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const decidedAt = clock.now;

      const booking = await transaction.booking.findUnique({
        where: { id: bookingId },
      });
      if (!booking) return { result: 'NOT_ELIGIBLE', reason: 'BOOKING_NOT_FOUND' };
      if (String(booking.status) === 'CONFIRMED') return { result: 'ALREADY_CONFIRMED' };
      if (String(booking.status) !== 'HOLDING') {
        return { result: 'NOT_ELIGIBLE', reason: `BOOKING_${String(booking.status)}` };
      }
      if (!(decidedAt < booking.holdExpiresAt)) {
        return { result: 'NOT_ELIGIBLE', reason: 'HOLD_EXPIRED' };
      }

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
              where: { paymentTransactionId: { in: receiptIds }, status: 'COMPLETED' },
              select: { amount: true },
            });
      const summary = summarizeBookingMoney({
        totalAmount: Number(booking.totalAmount.toString()),
        allocatedReceiptAmounts: receipts.map((receipt) =>
          Number(receipt.amount.toString()),
        ),
        completedRefundAmounts: refunds.map((refund) =>
          Number(refund.amount.toString()),
        ),
      });
      const required = Number(booking.requiredPrepaymentAmount.toString());
      if (!(summary.netCredited >= required && required > 0)) {
        return { result: 'NOT_ELIGIBLE', reason: 'INSUFFICIENT_VERIFIED_FUNDS' };
      }

      // Conditional update sở hữu transition (MIG-01): CAS version + recheck
      // status/hold trong cùng predicate — concurrent confirmer thứ hai rớt.
      const changed = await transaction.booking.updateMany({
        where: {
          id: bookingId,
          status: 'HOLDING',
          version: booking.version,
          holdExpiresAt: { gt: decidedAt },
        },
        data: {
          status: 'CONFIRMED',
          confirmedAt: decidedAt,
          version: { increment: 1 },
        },
      });
      if (!changed.count) {
        const current = await transaction.booking.findUnique({
          where: { id: bookingId },
          select: { status: true },
        });
        if (current && String(current.status) === 'CONFIRMED') {
          return { result: 'ALREADY_CONFIRMED' };
        }
        return { result: 'NOT_ELIGIBLE', reason: 'CONCURRENT_TRANSITION' };
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
      return { result: 'CONFIRMED' };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }

  /**
   * Exit hold kèm obligations (MIG-05): dùng chung cho lazy paths
   * (create/replay/cancel/availability/list) và expiry worker — một kết quả
   * duy nhất nhờ conditional update.
   */
  async expireHoldWithObligations(bookingId: string): Promise<ExitOutcome> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${bookingId}))`;
      const [clock] = await transaction.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const decidedAt = clock.now;

      const booking = await transaction.booking.findUnique({
        where: { id: bookingId },
        select: { id: true, status: true, version: true, holdExpiresAt: true },
      });
      if (!booking) return { result: 'ALREADY_FINAL', status: 'NOT_FOUND' };
      if (String(booking.status) !== 'HOLDING') {
        return { result: 'ALREADY_FINAL', status: String(booking.status) };
      }
      if (decidedAt < booking.holdExpiresAt) {
        return { result: 'CONFIRMED_INSTEAD' };
      }

      const changed = await transaction.booking.updateMany({
        where: {
          id: bookingId,
          status: 'HOLDING',
          version: booking.version,
          holdExpiresAt: { lte: decidedAt },
        },
        data: { status: 'EXPIRED', version: { increment: 1 } },
      });
      if (!changed.count) {
        return { result: 'ALREADY_FINAL', status: 'CONCURRENT' };
      }
      // Chỉ release occupancy ACTIVE đúng booking này (không chiếm lại của ai).
      await transaction.courtOccupancy.updateMany({
        where: { bookingId, state: 'ACTIVE' },
        data: { state: 'RELEASED', releasedAt: decidedAt },
      });
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId,
          fromStatus: 'HOLDING',
          toStatus: 'EXPIRED',
          actorType: 'SYSTEM',
          reason: 'Hết hạn giữ chỗ.',
        },
      });

      // MIG-05: giữ receipt evidence, tạo refund obligation LATE_PAYMENT
      // idempotent cho receipt đã credit — không cần quote/consent.
      const credited = await transaction.paymentTransaction.findMany({
        where: {
          paymentRequest: { referenceId: bookingId },
          verificationStatus: 'VERIFIED',
          allocationStatus: 'ALLOCATED',
        },
        select: { id: true, amount: true, currency: true },
      });
      let obligationsCreated = 0;
      for (const receipt of credited) {
        const key = `late-payment:${receipt.id}`;
        const existing = await transaction.refundRequest.findUnique({
          where: { idempotencyKey: key },
          select: { id: true },
        });
        if (existing) continue;
        await transaction.refundRequest.create({
          data: {
            paymentTransactionId: receipt.id,
            reasonType: 'LATE_PAYMENT',
            reason: 'Tiền về sau khi hold hết hạn — chờ đối soát hoàn.',
            amount: receipt.amount,
            currency: receipt.currency,
            method: 'MANUAL_BANK_TRANSFER',
            status: 'REQUESTED',
            idempotencyKey: key,
          },
        });
        await transaction.paymentTransaction.update({
          where: { id: receipt.id },
          data: { allocationStatus: 'REFUND_REQUIRED', reviewReason: 'LATE_PAYMENT_REVIEW' },
        });
        obligationsCreated += 1;
      }
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'BOOKING',
          aggregateId: bookingId,
          eventType: 'booking.expired',
          payload: { bookingId, obligationsCreated },
        },
      });
      return { result: 'EXPIRED', obligationsCreated };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
