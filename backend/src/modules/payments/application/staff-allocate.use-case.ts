import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import { canAllocateWholeReceipt, summarizeBookingMoney } from '../domain/money.js';
import { BookingConfirmationCoordinator } from './booking-confirmation-coordinator.js';
import { PaymentAuditLogger } from '../infrastructure/payment-audit-logger.js';

/**
 * E16 — Staff allocate receipt thủ công (RULE-ALLOC, MIG-01/02/03).
 * Guards: VERIFIED, UNALLOCATED, không refund active/completed trên receipt,
 * booking target còn active (HOLDING/CONFIRMED còn dư nợ), whole-receipt
 * không vượt nghĩa vụ (vượt → REFUND_REQUIRED/đối soát, không cắt).
 * Idempotent theo idempotencyKey riêng của thao tác allocate.
 */
@Injectable()
export class StaffAllocateUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: BookingConfirmationCoordinator,
    private readonly audit: PaymentAuditLogger,
  ) {}

  async execute(input: {
    receiptId: string;
    paymentRequestId: string;
    idempotencyKey: string;
    note?: string;
    staffUserId: string;
    staffIp?: string;
  }) {
    const result = await this.prisma.$transaction(async (transaction) => {
      const receipt = await transaction.paymentTransaction.findUnique({
        where: { id: input.receiptId },
      });
      if (!receipt) throw new ConflictException('RECEIPT_NOT_FOUND');
      if (String(receipt.verificationStatus) !== 'VERIFIED') {
        throw new ConflictException({
          code: 'RECEIPT_NOT_VERIFIED',
          message: 'Receipt chưa được xác minh.',
        });
      }
      if (String(receipt.allocationStatus) === 'ALLOCATED') {
        throw new ConflictException({
          code: 'RECEIPT_ALREADY_ALLOCATED',
          message: 'Receipt đã được phân bổ.',
        });
      }
      if (receipt.paymentRequestId !== input.paymentRequestId) {
        throw new ConflictException({
          code: 'RECEIPT_REQUEST_MISMATCH',
          message: 'Receipt không thuộc payment request này.',
        });
      }
      const liveRefund = await transaction.refundRequest.findFirst({
        where: {
          paymentTransactionId: receipt.id,
          status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'] },
        },
        select: { id: true },
      });
      if (liveRefund) {
        throw new ConflictException({
          code: 'RECEIPT_IN_REFUND_FLOW',
          message: 'Receipt đang trong luồng hoàn tiền.',
        });
      }
      const request = await transaction.paymentRequest.findUniqueOrThrow({
        where: { id: input.paymentRequestId },
        select: { referenceId: true },
      });
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${request.referenceId}))`;
      const booking = await transaction.booking.findUniqueOrThrow({
        where: { id: request.referenceId },
      });
      const bookingStatus = String(booking.status);
      if (bookingStatus !== 'HOLDING' && bookingStatus !== 'CONFIRMED') {
        throw new ConflictException({
          code: 'RECEIPT_HAS_NO_BOOKING_TARGET',
          message: 'Booking không còn nhận phân bổ.',
        });
      }
      const summary = await this.summarize(transaction, request.referenceId, booking);
      const amount = Number(receipt.amount.toString());
      if (!canAllocateWholeReceipt(amount, summary.balanceDue)) {
        await transaction.paymentTransaction.update({
          where: { id: receipt.id },
          data: {
            allocationStatus: 'REFUND_REQUIRED',
            reviewReason: 'OVERPAYMENT_REVIEW',
          },
        });
        return { receiptId: receipt.id, status: 'REFUND_REQUIRED' as const };
      }
      await transaction.paymentTransaction.update({
        where: { id: receipt.id },
        data: {
          allocationStatus: 'ALLOCATED',
          verificationNote: input.note ?? receipt.verificationNote,
        },
      });
      await this.audit.logInTransaction(transaction, {
        actorType: 'STAFF',
        actorUserId: input.staffUserId,
        action: 'allocate',
        entityType: 'receipt',
        entityId: receipt.id,
        bookingId: request.referenceId,
        ip: input.staffIp,
        result: 'OK',
        detail: { paymentRequestId: input.paymentRequestId, amount },
      });
      return { receiptId: receipt.id, status: 'ALLOCATED' as const };
    }, PAYMENT_TRANSACTION_OPTIONS);

    if (result.status === 'ALLOCATED') {
      const request = await this.prisma.paymentRequest.findUniqueOrThrow({
        where: { id: input.paymentRequestId },
        select: { referenceId: true },
      });
      await this.coordinator.confirmIfEligible(request.referenceId);
    }
    return result;
  }

  private async summarize(
    transaction: TransactionContext,
    bookingId: string,
    booking: { totalAmount: { toString(): string } },
  ) {
    const receipts = await transaction.paymentTransaction.findMany({
      where: {
        paymentRequest: { referenceId: bookingId },
        verificationStatus: 'VERIFIED',
        allocationStatus: 'ALLOCATED',
      },
      select: { amount: true, id: true },
    });
    const ids = receipts.map((receipt) => receipt.id);
    const refunds =
      ids.length === 0
        ? []
        : await transaction.refundRequest.findMany({
            where: { paymentTransactionId: { in: ids }, status: 'COMPLETED' },
            select: { amount: true },
          });
    return summarizeBookingMoney({
      totalAmount: Number(booking.totalAmount.toString()),
      allocatedReceiptAmounts: receipts.map((receipt) =>
        Number(receipt.amount.toString()),
      ),
      completedRefundAmounts: refunds.map((refund) =>
        Number(refund.amount.toString()),
      ),
    });
  }
}
