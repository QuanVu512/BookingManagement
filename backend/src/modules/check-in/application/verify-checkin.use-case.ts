import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { readCheckinMoney } from './checkin-money.js';

export interface StaffCheckinResult {
  bookingId: string;
  bookingCode: string;
  checkinId: string;
  status: 'CHECKED_IN';
  checkedInAt: Date;
  method: 'QR' | 'MANUAL';
  replayed: boolean;
}

/**
 * C10 — Điểm check-in nguyên tử dùng chung cho QR và thủ công.
 * - Replay được công nhận: đơn đã CHECKED_IN/checkin row tồn tại → trả
 *   replayed thay vì lỗi (second scan an toàn).
 * - Token QR: bind booking + purpose CHECKIN + chưa dùng/thu hồi/hết hạn
 *   (giờ DB); consume fill-once, thua race → 409.
 * - CAS booking CONFIRMED→CHECKED_IN theo version + history + outbox cùng tx
 *   dưới cùng booking-money lock (chống refund/cancel/counter races).
 */
export async function applyCheckinTx(
  tx: Prisma.TransactionClient,
  input: {
    bookingId: string;
    staffUserId: string;
    method: 'QR' | 'MANUAL';
    tokenId: string | null;
    note: string | null;
    decidedAt: Date;
  },
): Promise<StaffCheckinResult> {
  const booking = await tx.booking.findUnique({
    where: { id: input.bookingId },
  });
  if (!booking) {
    throw new BadRequestException({
      code: 'BOOKING_NOT_FOUND',
      message: 'Booking không tồn tại.',
    });
  }
  const existing = await tx.bookingCheckin.findUnique({
    where: { bookingId: booking.id },
  });
  if (existing || String(booking.status) === 'CHECKED_IN') {
    return {
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      checkinId: existing?.id ?? 'unknown',
      status: 'CHECKED_IN',
      checkedInAt: existing?.checkedInAt ?? input.decidedAt,
      method: existing ? (existing.method as 'QR' | 'MANUAL') : input.method,
      replayed: true,
    };
  }
  if (String(booking.status) !== 'CONFIRMED') {
    throw new ConflictException({
      code:
        String(booking.status) === 'CHECKED_IN'
          ? 'ALREADY_CHECKED_IN'
          : 'NOT_CONFIRMED',
      message: 'Đơn không ở trạng thái xác nhận để check-in.',
    });
  }
  const money = await readCheckinMoney(
    tx,
    booking.id,
    Number(booking.totalAmount.toString()),
  );
  if (money.balanceDue > 0) {
    throw new ConflictException({
      code: 'INSUFFICIENT_BALANCE',
      message: 'Đơn chưa thanh toán đủ — thu đủ tiền trước khi check-in (I10).',
    });
  }
  const changed = await tx.booking.updateMany({
    where: {
      id: booking.id,
      status: 'CONFIRMED',
      version: booking.version,
    },
    data: {
      status: 'CHECKED_IN',
      version: { increment: 1 },
    },
  });
  if (!changed.count) {
    throw new ConflictException({
      code: 'CONCURRENT_TRANSITION',
      message: 'Đơn vừa thay đổi — hãy tải lại và thử lại.',
    });
  }
  let checkinId: string;
  try {
    const created = await tx.bookingCheckin.create({
      data: {
        bookingId: booking.id,
        tokenId: input.tokenId,
        staffUserId: input.staffUserId,
        method: input.method,
        note: input.note,
      },
      select: { id: true },
    });
    checkinId = created.id;
  } catch {
    // Unique bookingId: race thắng ở nơi khác → công nhận replay.
    const raced = await tx.bookingCheckin.findUnique({
      where: { bookingId: booking.id },
      select: { id: true, checkedInAt: true, method: true },
    });
    if (!raced) throw new ConflictException({
      code: 'CONCURRENT_TRANSITION',
      message: 'Đơn vừa thay đổi — hãy tải lại và thử lại.',
    });
    return {
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      checkinId: raced.id,
      status: 'CHECKED_IN',
      checkedInAt: raced.checkedInAt,
      method: raced.method as 'QR' | 'MANUAL',
      replayed: true,
    };
  }
  await tx.bookingStatusHistory.create({
    data: {
      bookingId: booking.id,
      fromStatus: 'CONFIRMED',
      toStatus: 'CHECKED_IN',
      actorType: 'STAFF',
      actorUserId: input.staffUserId,
      reason:
        input.method === 'QR'
          ? 'Check-in QR tại quầy.'
          : `Check-in thủ công tại quầy: ${input.note ?? ''}`.slice(0, 500),
    },
  });
  await tx.outboxEvent.create({
    data: {
      aggregateType: 'BOOKING',
      aggregateId: booking.id,
      eventType: 'booking.checked-in',
      payload: {
        bookingId: booking.id,
        method: input.method,
        staffUserId: input.staffUserId,
      },
    },
  });
  return {
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    checkinId,
    status: 'CHECKED_IN',
    checkedInAt: input.decidedAt,
    method: input.method,
    replayed: false,
  };
}

/**
 * C10 — Quét QR tại quầy (STAFF). Token hết hiệu lực theo endsAt đã cấp
 * lúc mint; verify không áp lại window D02 (tránh từ chối mã vừa cấp).
 */
@Injectable()
export class VerifyCheckinUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: {
    bookingId: string;
    rawToken: string;
    staffUserId: string;
  }): Promise<StaffCheckinResult> {
    if (typeof input.rawToken !== 'string' || input.rawToken.length < 32) {
      throw new BadRequestException({
        code: 'INVALID_TOKEN',
        message: 'Mã check-in không hợp lệ.',
      });
    }
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${input.bookingId}))`;
      const [clock] = await transaction.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const decidedAt = clock.now;

      const tokenHash = createHash('sha256')
        .update(input.rawToken)
        .digest('hex');
      const token = await transaction.bookingAccessToken.findUnique({
        where: { tokenHash },
      });
      if (
        !token ||
        token.bookingId !== input.bookingId ||
        String(token.purpose) !== 'CHECKIN'
      ) {
        throw new BadRequestException({
          code: 'TOKEN_INVALID',
          message: 'Mã check-in không đúng đơn này.',
        });
      }
      if (token.revokedAt !== null || token.consumedAt !== null) {
        // Đã dùng/thu hồi: đơn đã CHECKED_IN thì công nhận replay ở dưới;
        // chưa thì báo rõ thay vì 500.
        const checkin = await transaction.bookingCheckin.findUnique({
          where: { bookingId: input.bookingId },
        });
        if (checkin) {
          const booking = await transaction.booking.findUniqueOrThrow({
            where: { id: input.bookingId },
          });
          return {
            bookingId: booking.id,
            bookingCode: booking.bookingCode,
            checkinId: checkin.id,
            status: 'CHECKED_IN' as const,
            checkedInAt: checkin.checkedInAt,
            method: checkin.method as 'QR' | 'MANUAL',
            replayed: true,
          };
        }
        throw new ConflictException({
          code: 'TOKEN_CONSUMED',
          message: 'Mã check-in đã được sử dụng hoặc thu hồi.',
        });
      }
      if (!(token.expiresAt.getTime() > decidedAt.getTime())) {
        throw new ConflictException({
          code: 'TOKEN_EXPIRED',
          message: 'Mã check-in đã hết hạn — cấp mã mới cho khách.',
        });
      }
      const consumed = await transaction.bookingAccessToken.updateMany({
        where: { id: token.id, consumedAt: null, revokedAt: null },
        data: { consumedAt: decidedAt },
      });
      if (!consumed.count) {
        throw new ConflictException({
          code: 'TOKEN_CONSUMED',
          message: 'Mã check-in vừa được sử dụng ở nơi khác.',
        });
      }
      return applyCheckinTx(transaction, {
        bookingId: input.bookingId,
        staffUserId: input.staffUserId,
        method: 'QR',
        tokenId: token.id,
        note: null,
        decidedAt,
      });
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
