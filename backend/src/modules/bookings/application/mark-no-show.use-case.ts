import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import { PaymentAuditLogger } from '../../payments/infrastructure/payment-audit-logger.js';
import {
  applyDepositForfeitureTx,
  type DepositForfeitureTxResult,
} from './deposit-forfeiture-tx.js';

/**
 * D03 — Đánh NO_SHOW tự động cho CONFIRMED quá endsAt mà chưa check-in.
 * - Chỉ CONFIRMED→NO_SHOW (CAS): không bao giờ trùng CANCELLED trên cùng đơn.
 * - Tịch thu deposit 30% + nghĩa vụ hoàn phần verified vượt deposit.
 * - Gọi bởi settle sweep (SYSTEM) — không tự chạy ở đây.
 */
@Injectable()
export class MarkNoShowUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PaymentAuditLogger,
  ) {}

  async execute(input: {
    bookingId: string;
    idempotencyKey: string;
  }): Promise<DepositForfeitureTxResult> {
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
      if (String(booking.status) === 'NO_SHOW') {
        const existing = await transaction.bookingCancellationRequest.findFirst({
          where: { bookingId: booking.id, policyVersion: 'no-show-v1.0' },
          orderBy: { createdAt: 'desc' },
        });
        if (existing) {
          return applyDepositForfeitureTx(transaction, this.audit, {
            booking: {
              id: booking.id,
              bookingCode: booking.bookingCode,
              version: booking.version,
              totalAmount: Number(booking.totalAmount.toString()),
            },
            decidedAt,
            toStatus: 'NO_SHOW',
            actorType: 'SYSTEM',
            actorUserId: null,
            historyReason: 'Quá giờ không check-in — tịch thu deposit 30%.',
            policyVersion: 'no-show-v1.0',
            policyText: 'NO_SHOW policy no-show-v1.0.',
            eventType: 'booking.no_show',
            refundKeyPrefix: 'noshow',
            requestKey: existing.idempotencyKey,
          });
        }
      }
      if (String(booking.status) !== 'CONFIRMED') {
        throw new ConflictException({
          code: 'NOT_CONFIRMED',
          message: 'Chỉ đơn xác nhận quá giờ mới đánh NO_SHOW.',
        });
      }
      if (!(decidedAt.getTime() >= booking.endsAt.getTime())) {
        throw new ConflictException({
          code: 'TOO_EARLY',
          message: 'Chưa hết giờ sân — chưa thể đánh NO_SHOW.',
        });
      }
      const total = Number(booking.totalAmount.toString());
      return applyDepositForfeitureTx(transaction, this.audit, {
        booking: {
          id: booking.id,
          bookingCode: booking.bookingCode,
          version: booking.version,
          totalAmount: total,
        },
        decidedAt,
        toStatus: 'NO_SHOW',
        actorType: 'SYSTEM',
        actorUserId: null,
        historyReason: 'Quá giờ không check-in — tịch thu deposit 30%.',
        policyVersion: 'no-show-v1.0',
        policyText:
          `NO_SHOW: đơn ${booking.bookingCode} quá giờ không check-in. ` +
          `Tịch thu deposit 30% tổng ${total.toLocaleString('vi-VN')}đ, ` +
          `hoàn phần verified vượt deposit (nếu có) qua quầy, thủ công đối soát.`,
        eventType: 'booking.no_show',
        refundKeyPrefix: 'noshow',
        requestKey: input.idempotencyKey,
      });
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
