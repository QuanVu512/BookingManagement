import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import { quoteAggregateCancellation } from '../domain/cancellation-policy.js';
import { isInLateCancelWindow } from '../domain/deposit-forfeiture.js';
import { invalidateCourtDayCache } from './get-court-day-occupancies.use-case.js';
import type { CancellationActorType } from './request-paid-cancellation.use-case.js';

export interface ApplyPaidCancellationInput {
  bookingId: string;
  quoteId: string;
  /** Bằng chứng khách đã đọc và đồng ý phí/hoàn — bắt buộc true. */
  accepted: boolean;
  actorUserId: string | null;
  actorType: CancellationActorType;
  guestBookingId?: string;
  idempotencyKey: string;
}

export interface AppliedCancellationResult {
  bookingId: string;
  bookingCode: string;
  status: 'CANCELLED';
  penaltyAmount: number;
  totalRefund: number;
  refundRequestIds: string[];
  replayed: boolean;
}

/**
 * C08 — Áp dụng hủy có hoàn (consent + transition nguyên tử).
 * - accepted phải true tường minh; quote hết hạn → 410, state đổi → 409.
 * - CANCELLED + RELEASED + history + outbox + refund obligations trong MỘT tx.
 * - Hủy không chờ ngân hàng; refund success theo dõi riêng ở refund attempts.
 */
@Injectable()
export class ApplyPaidCancellationUseCase {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async execute(
    input: ApplyPaidCancellationInput,
  ): Promise<AppliedCancellationResult> {
    if (input.accepted !== true) {
      throw new BadRequestException({
        code: 'CONSENT_REQUIRED',
        message: 'Cần xác nhận đồng ý phí hủy và số tiền hoàn.',
      });
    }
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
    let releasedCourtId: string | null = null;
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${input.bookingId}))`;
      const [clock] = await transaction.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const decidedAt = clock.now;

      const quote = await transaction.bookingCancellationRequest.findUnique({
        where: { id: input.quoteId },
      });
      if (!quote || quote.bookingId !== input.bookingId) {
        throw new BadRequestException({
          code: 'QUOTE_NOT_FOUND',
          message: 'Báo phí không tồn tại cho đơn này.',
        });
      }
      // Replay: apply đã xong cho cùng idempotencyKey → trả trạng thái hiện tại.
      if (String(quote.status) === 'APPLIED') {
        const refunds = await transaction.refundRequest.findMany({
          where: { cancellationRequestId: quote.id },
          select: { id: true },
        });
        const booking = await transaction.booking.findUniqueOrThrow({
          where: { id: input.bookingId },
        });
        return {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          status: 'CANCELLED' as const,
          penaltyAmount: Number(quote.penaltyAmount.toString()),
          totalRefund: Number(quote.refundAmount.toString()),
          refundRequestIds: refunds.map((row) => row.id),
          replayed: true,
        };
      }
      if (String(quote.status) !== 'QUOTED') {
        throw new ConflictException({
          code: 'QUOTE_NOT_APPLICABLE',
          message: 'Báo phí không còn hiệu lực áp dụng.',
        });
      }
      if (!(decidedAt <= quote.expiresAt)) {
        throw new GoneException({
          code: 'QUOTE_EXPIRED',
          message: 'Báo phí đã hết hạn — hãy lấy báo phí mới.',
        });
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
      if (input.actorType === 'GUEST') {
        if (
          booking.userId !== null ||
          input.guestBookingId !== input.bookingId
        ) {
          throw new ForbiddenException({
            code: 'NOT_YOUR_BOOKING',
            message: 'Không có quyền hủy đơn này.',
          });
        }
      } else if (
        booking.userId === null ||
        booking.userId !== input.actorUserId
      ) {
        throw new ForbiddenException({
          code: 'NOT_YOUR_BOOKING',
          message: 'Không có quyền hủy đơn này.',
        });
      }
      if (String(booking.status) !== 'CONFIRMED') {
        throw new ConflictException({
          code: 'BOOKING_NOT_CONFIRMED',
          message: 'Đơn không còn ở trạng thái xác nhận.',
        });
      }
      // D16: quote lấy trước cửa sổ nhưng apply trong cửa sổ → từ chối,
      // chuyển ra quầy (staff late-cancel, tịch thu deposit).
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
            'Đơn đã vào cửa sổ hủy muộn — chỉ nhân viên quầy được hủy, vui lòng liên hệ quầy hỗ trợ.',
        });
      }
      if (booking.version !== quote.bookingVersion) {
        throw new ConflictException({
          code: 'QUOTE_STALE',
          message: 'Đơn đã thay đổi sau báo phí — hãy lấy báo phí mới.',
        });
      }

      // Recompute dưới cùng lock; lệch revision → stale.
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
        const key = String(row.paymentTransactionId);
        const amount = Number(row.amount.toString());
        if (String(row.status) === 'COMPLETED') {
          completedByReceipt[key] = (completedByReceipt[key] ?? 0) + amount;
        } else {
          reservedByReceipt[key] = (reservedByReceipt[key] ?? 0) + amount;
        }
      }
      const policy = quoteAggregateCancellation({
        totalAmount: Number(booking.totalAmount.toString()),
        penaltyPercent: 10,
        receipts: receipts.map((receipt) => ({
          receiptId: receipt.id,
          creditedAmount: Number(receipt.amount.toString()),
        })),
        reservedByReceipt,
        completedByReceipt,
      });
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
        'cancel-v1.0',
      ].sort();
      const rawJoined = revisionParts.join('|');
      const hashedRevision = createHash('sha256')
        .update(rawJoined)
        .digest('hex');
      const revisionMatches =
        quote.paymentSnapshotRevision === hashedRevision ||
        quote.paymentSnapshotRevision === rawJoined;

      if (
        !revisionMatches ||
        policy.totalRefund !== Number(quote.refundAmount.toString()) ||
        policy.penaltyAmount !== Number(quote.penaltyAmount.toString())
      ) {
        throw new ConflictException({
          code: 'QUOTE_STALE',
          message: 'Tiền/phí đã thay đổi sau báo phí — hãy lấy báo phí mới.',
        });
      }

      const changed = await transaction.booking.updateMany({
        where: {
          id: booking.id,
          status: 'CONFIRMED',
          version: booking.version,
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: decidedAt,
          version: { increment: 1 },
        },
      });
      if (!changed.count) {
        throw new ConflictException({
          code: 'CONCURRENT_TRANSITION',
          message: 'Đơn vừa thay đổi — hãy tải lại và thử lại.',
        });
      }
      await transaction.courtOccupancy.updateMany({
        where: { bookingId: booking.id, state: 'ACTIVE' },
        data: { state: 'RELEASED', releasedAt: decidedAt },
      });
      releasedCourtId = booking.courtId;
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'CONFIRMED',
          toStatus: 'CANCELLED',
          actorType: input.actorType,
          actorUserId: input.actorUserId,
          reason: 'Khách xác nhận hủy có phí 10%.',
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'BOOKING',
          aggregateId: booking.id,
          eventType: 'booking.cancelled',
          payload: {
            bookingId: booking.id,
            cancellationRequestId: quote.id,
            refundAmount: policy.totalRefund,
          },
        },
      });

      const refundRequestIds: string[] = [];
      for (const line of policy.lines) {
        if (line.refundAmount <= 0) continue;
        const existing = await transaction.refundRequest.findUnique({
          where: {
            idempotencyKey: `cancel-apply:${quote.id}:${line.receiptId}`,
          },
          select: { id: true },
        });
        if (existing) {
          refundRequestIds.push(existing.id);
          continue;
        }
        const created = await transaction.refundRequest.create({
          data: {
            paymentTransactionId: line.receiptId,
            cancellationRequestId: quote.id,
            reasonType: 'CUSTOMER_CANCELLATION',
            reason: `Hoàn sau hủy có phí 10% (quote ${quote.id}).`,
            amount: line.refundAmount,
            currency: 'VND',
            method: 'MANUAL_BANK_TRANSFER',
            status: 'REQUESTED',
            requestedByUserId: input.actorUserId,
            idempotencyKey: `cancel-apply:${quote.id}:${line.receiptId}`,
          },
        });
        refundRequestIds.push(created.id);
      }

      await transaction.bookingCancellationRequest.updateMany({
        where: { id: quote.id, status: 'QUOTED' },
        data: {
          status: 'APPLIED',
          acceptedAt: decidedAt,
          appliedAt: decidedAt,
        },
      });
      return {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: 'CANCELLED' as const,
        penaltyAmount: policy.penaltyAmount,
        totalRefund: policy.totalRefund,
        refundRequestIds,
        replayed: false,
      };
    }, PAYMENT_TRANSACTION_OPTIONS);
    // Day-grid invalidation after commit (fail-open). Replay path leaves
    // releasedCourtId null, so no invalidation is attempted for it.
    if (releasedCourtId) {
      await invalidateCourtDayCache(this.redis, releasedCourtId);
    }
    return result;
  }
}
