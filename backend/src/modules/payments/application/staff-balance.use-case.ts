import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import { summarizeBookingMoney } from '../domain/money.js';
import { BookingConfirmationCoordinator } from './booking-confirmation-coordinator.js';
import { PaymentAuditLogger } from '../infrastructure/payment-audit-logger.js';

export interface StaffBalanceInput {
  bookingId: string;
  method: 'CASH' | 'MANUAL_BANK_TRANSFER';
  /** Chỉ stale-check (D-06): BE tự compute remaining. */
  amount?: number;
  transactionReference?: string;
  idempotencyKey: string;
  staffUserId: string;
  staffIp?: string;
}

/**
 * E14 — Staff thu số dư (RULE-BALANCE, MIG-02).
 * - Thu BALANCE cho HOLDING hoặc CONFIRMED còn dư nợ (không dùng hold
 *   deadline chặn CONFIRMED); terminal khác → 409.
 * - amount client chỉ stale-check: lệch remaining → 409 PAYMENT_AMOUNT_STALE.
 * - CASH: VERIFIED ngay (recordedBy = verifiedBy = staff). BANK: cần
 *   transactionReference, unique DB bảo vệ (409 RECEIPT_REFERENCE_DUP).
 * - Idempotency: cùng key → replay cùng result (recompute read-only).
 */
@Injectable()
export class StaffBalanceUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coordinator: BookingConfirmationCoordinator,
    private readonly audit: PaymentAuditLogger,
  ) {}

  async execute(input: StaffBalanceInput) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${input.bookingId}))`;
      const [clock] = await transaction.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const decidedAt = clock.now;

      const replay = await transaction.paymentRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (replay) {
        return this.presentReplay(transaction, replay.id);
      }

      const booking = await transaction.booking.findUnique({
        where: { id: input.bookingId },
      });
      if (!booking) throw new BadRequestException('BOOKING_NOT_FOUND');
      const status = String(booking.status);
      if (status !== 'HOLDING' && status !== 'CONFIRMED') {
        throw new ConflictException({
          code: 'BOOKING_NOT_HOLDING',
          message: 'Booking không ở trạng thái thu được.',
        });
      }

      const money = await this.readMoney(transaction, input.bookingId, booking);
      if (money.balanceDue <= 0) {
        throw new ConflictException({
          code: 'BALANCE_ALREADY_PAID',
          message: 'Booking đã đủ tiền.',
        });
      }
      if (input.amount !== undefined && input.amount !== money.balanceDue) {
        throw new ConflictException({
          code: 'PAYMENT_AMOUNT_STALE',
          message: 'Số dư đã thay đổi. Hãy tải lại.',
        });
      }
      if (input.method === 'MANUAL_BANK_TRANSFER' && !input.transactionReference) {
        throw new BadRequestException('Thiếu transactionReference.');
      }

      const receivingAccountKey =
        input.method === 'CASH' ? 'CASH:COUNTER' : 'MANUAL:COUNTER';
      const request = await transaction.paymentRequest.create({
        data: {
          paymentCode: `PAY-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`,
          referenceType: 'BOOKING',
          referenceId: input.bookingId,
          purpose: 'BALANCE',
          amount: money.balanceDue,
          currency: 'VND',
          method: input.method,
          provider: null,
          providerChannelId: null,
          status: 'PENDING',
          expiresAt: null,
          createdByUserId: input.staffUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
      let receiptId: string;
      try {
        const receipt = await transaction.paymentTransaction.create({
          data: {
            paymentRequestId: request.id,
            provider: null,
            method: input.method === 'CASH' ? 'CASH' : 'BANK_TRANSFER',
            receivingAccountKey,
            transactionReference: input.transactionReference ?? null,
            amount: money.balanceDue,
            currency: 'VND',
            verificationStatus: 'VERIFIED',
            allocationStatus: 'ALLOCATED',
            confirmationSource: 'STAFF',
            fundsReceivedAt: decidedAt,
            recordedByUserId: input.staffUserId,
            verifiedByUserId: input.staffUserId,
            verifiedAt: decidedAt,
            verificationNote: `Staff balance ${input.method}`,
            idempotencyKey: `staff-balance:${input.idempotencyKey}`,
          },
        });
        receiptId = receipt.id;
      } catch (error: unknown) {
        if (this.isUniqueViolation(error)) {
          throw new ConflictException({
            code: 'RECEIPT_REFERENCE_DUP',
            message: 'Reference đã được ghi nhận.',
          });
        }
        throw error;
      }

      await this.audit.logInTransaction(transaction, {
        actorType: 'STAFF',
        actorUserId: input.staffUserId,
        action: 'balance',
        entityType: 'payment_request',
        entityId: request.id,
        bookingId: input.bookingId,
        ip: input.staffIp,
        result: 'OK',
        detail: { method: input.method, amount: money.balanceDue },
      });
      return {
        requestId: request.id,
        receiptId,
        bookingId: input.bookingId,
        amount: money.balanceDue,
      };
    }, PAYMENT_TRANSACTION_OPTIONS).then(async (result) => {
      // Confirm NGOÀI tx ghi tiền? Không — confirm cần cùng evidence nhưng
      // chạy tx riêng serialize bằng advisory lock (BE-PAY-11).
      await this.coordinator.confirmIfEligible(result.bookingId);
      return result;
    });
  }

  private async readMoney(
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

  private async presentReplay(
    transaction: TransactionContext,
    requestId: string,
  ) {
    const receipt = await transaction.paymentTransaction.findFirst({
      where: { paymentRequestId: requestId },
      select: { id: true, amount: true, paymentRequestId: true },
    });
    const request = await transaction.paymentRequest.findUniqueOrThrow({
      where: { id: requestId },
      select: { referenceId: true, amount: true },
    });
    return {
      requestId,
      receiptId: receipt?.id ?? null,
      bookingId: request.referenceId,
      amount: Number(request.amount.toString()),
    };
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'P2002'
    );
  }
}
