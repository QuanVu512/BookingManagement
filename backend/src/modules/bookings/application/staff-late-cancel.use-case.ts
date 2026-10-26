import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import { PaymentAuditLogger } from '../../payments/infrastructure/payment-audit-logger.js';
import {
  applyDepositForfeitureTx,
  type DepositForfeitureTxResult,
} from './deposit-forfeiture-tx.js';
import { isInLateCancelWindow } from '../domain/deposit-forfeiture.js';

/**
 * D16 — Staff hủy muộn trong [startsAt − 12h, endsAt).
 * - Chỉ CONFIRMED; member/guest tự hủy trong cửa sổ này bị từ chối ở flow
 *   thường (LATE_WINDOW_STAFF_ONLY) và chuyển ra quầy.
 * - Tịch thu deposit 30% (KHÔNG cộng phí 10% thường); hoàn phần verified
 *   vượt deposit qua nghĩa vụ REQUESTED.
 * - Bắt buộc reason + idempotencyKey; CAS chống đua với NO_SHOW sweep.
 */
@Injectable()
export class StaffLateCancelUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PaymentAuditLogger,
  ) {}

  async execute(input: {
    bookingId: string;
    staffUserId: string;
    reason: string;
    idempotencyKey: string;
  }): Promise<DepositForfeitureTxResult> {
    if (
      typeof input.reason !== 'string' ||
      input.reason.trim().length < 5 ||
      input.reason.length > 500
    ) {
      throw new BadRequestException({
        code: 'REASON_REQUIRED',
        message: 'Hủy muộn bắt buộc ghi lý do (5–500 ký tự).',
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
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${input.bookingId}))`;
      const [clock] = await transaction.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const decidedAt = clock.now;

      const booking = await transaction.booking.findUnique({
        where: { id: input.bookingId },
      });
      if (!booking) {
        throw new BadRequestException({
          code: 'BOOKING_NOT_FOUND',
          message: 'Booking không tồn tại.',
        });
      }
      if (String(booking.status) !== 'CONFIRMED') {
        throw new ForbiddenException({
          code: 'NOT_CONFIRMED',
          message: 'Chỉ hủy muộn đơn đang xác nhận.',
        });
      }
      if (
        !isInLateCancelWindow({
          nowMs: decidedAt.getTime(),
          startsAtMs: booking.startsAt.getTime(),
          endsAtMs: booking.endsAt.getTime(),
        })
      ) {
        throw new ConflictException({
          code: 'NOT_LATE_WINDOW',
          message:
            'Ngoài cửa sổ hủy muộn (12h trước giờ bắt đầu đến trước giờ kết thúc) — dùng flow hủy thường hoặc chờ NO_SHOW tự động.',
        });
      }
      const total = Number(booking.totalAmount.toString());
      const reason = input.reason.trim();
      return applyDepositForfeitureTx(transaction, this.audit, {
        booking: {
          id: booking.id,
          bookingCode: booking.bookingCode,
          version: booking.version,
          totalAmount: total,
        },
        decidedAt,
        toStatus: 'CANCELLED',
        actorType: 'STAFF',
        actorUserId: input.staffUserId,
        historyReason: `Staff hủy muộn: ${reason}`,
        policyVersion: 'deposit-forfeiture-v1.0',
        policyText:
          `Hủy muộn bởi staff: đơn ${booking.bookingCode}. ` +
          `Tịch thu deposit 30% tổng ${total.toLocaleString('vi-VN')}đ, ` +
          `hoàn phần verified vượt deposit (nếu có) qua quầy, thủ công đối soát. ` +
          `Không áp thêm phí hủy thường 10%.`,
        eventType: 'booking.cancelled',
        refundKeyPrefix: 'late-cancel',
        requestKey: input.idempotencyKey,
      });
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
