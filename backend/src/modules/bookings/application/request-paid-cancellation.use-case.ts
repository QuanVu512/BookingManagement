import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import { quoteAggregateCancellation } from '../domain/cancellation-policy.js';
import { isInLateCancelWindow } from '../domain/deposit-forfeiture.js';

export type CancellationActorType = 'CUSTOMER' | 'GUEST';

export interface RequestPaidCancellationInput {
  bookingId: string;
  actorUserId: string | null;
  actorType: CancellationActorType;
  /** Guest đã bind qua GuestTokenGuard; member bỏ qua. */
  guestBookingId?: string;
  reason?: string;
  idempotencyKey: string;
}

export interface PaidCancellationQuoteResult {
  quoteId: string;
  bookingId: string;
  bookingVersion: number;
  status: string;
  totalAmount: number;
  paidAmount: number;
  penaltyAmount: number;
  refundAmount: number;
  currency: string;
  policyVersion: string;
  policyText: string;
  expiresAt: Date;
  replayed: boolean;
}

const POLICY_VERSION = 'cancel-v1.0';
const QUOTE_TTL_MS = 10 * 60_000;

/**
 * C08 — Báo phí hủy có thu (member CONFIRMED + guest CONFIRMED qua token).
 * - Chỉ booking CONFIRMED còn trong cửa sổ hủy (mặc định startsAt, D01).
 * - Phí 10% aggregate một lần (domain thuần, single source).
 * - Replay cùng idempotencyKey trả quote đã persist, không tạo mới.
 */
@Injectable()
export class RequestPaidCancellationUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(
    input: RequestPaidCancellationInput,
  ): Promise<PaidCancellationQuoteResult> {
    this.validateInput(input);
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${input.bookingId}))`;
      const [clock] = await transaction.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const decidedAt = clock.now;

      const replay = await transaction.bookingCancellationRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (replay) {
        if (replay.bookingId !== input.bookingId) {
          throw new ConflictException({
            code: 'CANCEL_INTENT_MISMATCH',
            message: 'Khóa idempotency đã dùng cho đơn khác (409).',
          });
        }
        return this.present(replay, true);
      }

      const booking = await transaction.booking.findUnique({
        where: { id: input.bookingId },
      });
      if (!booking) {
        throw new BadRequestException({
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking không tồn tại.',
        });
      }
      this.assertOwner(booking.userId, input);
      if (String(booking.status) !== 'CONFIRMED') {
        throw new ConflictException({
          code: 'CANCEL_NOT_CONFIRMED',
          message: 'Chỉ hủy có hoàn khi booking đã xác nhận thanh toán.',
        });
      }
      // D16: trong 12h trước startsAt đến trước endsAt chỉ staff được hủy
      // (tịch thu deposit) — member/guest ra quầy, không áp phí 10% ở đây.
      if (
        isInLateCancelWindow({
          nowMs: decidedAt.getTime(),
          startsAtMs: booking.startsAt.getTime(),
          endsAtMs: booking.endsAt.getTime(),
        })
      ) {
        throw new ConflictException({
          code: 'LATE_WINDOW_STAFF_ONLY',
          message:
            'Trong 12 giờ trước giờ bắt đầu chỉ nhân viên quầy được hủy — vui lòng liên hệ quầy hỗ trợ.',
        });
      }
      const deadline = booking.cancellationDeadlineAt ?? booking.startsAt;
      if (!(decidedAt < deadline)) {
        throw new GoneException({
          code: 'CANCELLATION_WINDOW_CLOSED',
          message: 'Đã quá hạn hủy trực tuyến — liên hệ quầy hỗ trợ.',
        });
      }

      const receipts = await transaction.paymentTransaction.findMany({
        where: {
          paymentRequest: { referenceId: input.bookingId },
          verificationStatus: 'VERIFIED',
          allocationStatus: 'ALLOCATED',
        },
        orderBy: { createdAt: 'asc' },
      });
      const holds = await transaction.refundRequest.findMany({
        where: {
          paymentTransactionId: {
            in: receipts.map((receipt) => receipt.id),
          },
          status: { in: ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'] },
        },
        select: { paymentTransactionId: true, amount: true, status: true },
      });
      const reservedByReceipt: Record<string, number> = {};
      const completedByReceipt: Record<string, number> = {};
      for (const row of holds) {
        const amount = Number(row.amount.toString());
        const key = String(row.paymentTransactionId);
        if (String(row.status) === 'COMPLETED') {
          completedByReceipt[key] = (completedByReceipt[key] ?? 0) + amount;
        } else {
          reservedByReceipt[key] = (reservedByReceipt[key] ?? 0) + amount;
        }
      }
      const total = Number(booking.totalAmount.toString());
      const policy = quoteAggregateCancellation({
        totalAmount: total,
        penaltyPercent: 10,
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
      if (paid <= 0) {
        throw new ConflictException({
          code: 'NO_PAID_FUNDS',
          message: 'Booking chưa có tiền đã xác minh — không có gì để hoàn.',
        });
      }
      const completed = Object.values(completedByReceipt).reduce(
        (sum, value) => sum + value,
        0,
      );
      const reserved = Object.values(reservedByReceipt).reduce(
        (sum, value) => sum + value,
        0,
      );
      const revisionParts = [
        `booking:${booking.id}:v${booking.version}`,
        ...receipts.map(
          (receipt) =>
            `${receipt.id}:${receipt.amount.toString()}:${String(receipt.verificationStatus)}:${String(receipt.allocationStatus)}`,
        ),
        ...holds.map(
          (row) =>
            `${row.paymentTransactionId}:${row.amount.toString()}:${String(row.status)}`,
        ),
        POLICY_VERSION,
      ].sort();
      const policyText =
        `Hủy đơn ${booking.bookingCode}: tổng ${total.toLocaleString('vi-VN')}đ, ` +
        `phí hủy 10% là ${policy.penaltyAmount.toLocaleString('vi-VN')}đ, ` +
        `dự kiến hoàn ${policy.totalRefund.toLocaleString('vi-VN')}đ. ` +
        `Hoàn thủ công qua quầy, không trừ thêm phí.`;
      const created = await transaction.bookingCancellationRequest.create({
        data: {
          bookingId: booking.id,
          bookingVersion: booking.version,
          totalAmountSnapshot: total,
          paidAmountSnapshot: paid,
          refundedAmountSnapshot: completed,
          reservedRefundAmountSnapshot: reserved,
          penaltyPercent: 10,
          penaltyAmount: policy.penaltyAmount,
          refundAmount: policy.totalRefund,
          currency: 'VND',
          policyVersion: POLICY_VERSION,
          policyTextSnapshot: policyText,
          paymentSnapshotRevision: createHash('sha256')
            .update(revisionParts.join('|'))
            .digest('hex'),
          actorType: input.actorType,
          requestedByUserId: input.actorUserId,
          reason: input.reason ?? null,
          status: 'QUOTED',
          expiresAt: new Date(decidedAt.getTime() + QUOTE_TTL_MS),
          idempotencyKey: input.idempotencyKey,
        },
      });
      return this.present(created, false);
    }, PAYMENT_TRANSACTION_OPTIONS);
  }

  private validateInput(input: RequestPaidCancellationInput): void {
    if (
      typeof input.idempotencyKey !== 'string' ||
      input.idempotencyKey.length < 16 ||
      input.idempotencyKey.length > 100
    ) {
      throw new BadRequestException({
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Khóa idempotency không hợp lệ.',
      });
    }
  }

  private assertOwner(
    ownerUserId: string | null,
    input: RequestPaidCancellationInput,
  ): void {
    if (input.actorType === 'GUEST') {
      if (ownerUserId !== null || input.guestBookingId !== input.bookingId) {
        throw new ForbiddenException({
          code: 'NOT_YOUR_BOOKING',
          message: 'Không có quyền hủy đơn này.',
        });
      }
      return;
    }
    if (ownerUserId === null || ownerUserId !== input.actorUserId) {
      throw new ForbiddenException({
        code: 'NOT_YOUR_BOOKING',
        message: 'Không có quyền hủy đơn này.',
      });
    }
  }

  private present(
    row: {
      id: string;
      bookingId: string;
      bookingVersion: number;
      status: unknown;
      totalAmountSnapshot: { toString(): string };
      paidAmountSnapshot: { toString(): string };
      penaltyAmount: { toString(): string };
      refundAmount: { toString(): string };
      currency: string;
      policyVersion: string;
      policyTextSnapshot: string;
      expiresAt: Date;
    },
    replayed: boolean,
  ): PaidCancellationQuoteResult {
    return {
      quoteId: row.id,
      bookingId: row.bookingId,
      bookingVersion: row.bookingVersion,
      status: String(row.status),
      totalAmount: Number(row.totalAmountSnapshot.toString()),
      paidAmount: Number(row.paidAmountSnapshot.toString()),
      penaltyAmount: Number(row.penaltyAmount.toString()),
      refundAmount: Number(row.refundAmount.toString()),
      currency: row.currency,
      policyVersion: row.policyVersion,
      policyText: row.policyTextSnapshot,
      expiresAt: row.expiresAt,
      replayed,
    };
  }
}
