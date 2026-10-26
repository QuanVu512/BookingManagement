import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import {
  checkinEligibility,
  readCheckinWindow,
} from '../domain/checkin-eligibility.js';
import { applyCheckinTx } from './verify-checkin.use-case.js';
import { readCheckinMoney } from './checkin-money.js';

/**
 * C10 — Check-in thủ công tại quầy (STAFF, bắt buộc ghi chú + vai trò).
 * - Cửa sổ D02 áp như mint (fail-closed khi chưa cấu hình).
 * - Không tái dùng token MANAGE_BOOKING làm bằng chứng check-in.
 * - D02 "manual exception ai duyệt" còn OPEN: giới hạn STAFF+ theo guard
 *   hiện hành, mọi lượt ghi audit actor/note; exception vượt window không
 *   được phép ở đây.
 */
@Injectable()
export class ManualCheckinUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: {
    bookingId: string;
    staffUserId: string;
    note: string;
  }) {
    if (
      typeof input.note !== 'string' ||
      input.note.trim().length < 5 ||
      input.note.length > 500
    ) {
      throw new BadRequestException({
        code: 'NOTE_REQUIRED',
        message: 'Check-in thủ công bắt buộc ghi chú lý do (5–500 ký tự).',
      });
    }
    const window = readCheckinWindow((name) => this.config.get<string>(name));
    if (!window) {
      throw new ServiceUnavailableException({
        code: 'CHECKIN_DISABLED',
        message:
          'Cửa sổ check-in đang cấu hình không hợp lệ — liên hệ quản lý.',
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
      const total = Number(booking.totalAmount.toString());
      const money = await readCheckinMoney(transaction, booking.id, total);
      const already = await transaction.bookingCheckin.findUnique({
        where: { bookingId: booking.id },
        select: { id: true },
      });
      const eligibility = checkinEligibility({
        status: String(booking.status),
        netCredited: money.netCredited,
        totalAmount: total,
        hasCheckin: already !== null,
        nowMs: decidedAt.getTime(),
        startsAtMs: booking.startsAt.getTime(),
        endsAtMs: booking.endsAt.getTime(),
        window,
      });
      if (!eligibility.eligible) {
        if (eligibility.code === 'ALREADY_CHECKED_IN') {
          return applyCheckinTx(transaction, {
            bookingId: booking.id,
            staffUserId: input.staffUserId,
            method: 'MANUAL',
            tokenId: null,
            note: input.note.trim(),
            decidedAt,
          });
        }
        throw new ConflictException({
          code: eligibility.code,
          message: 'Đơn chưa đủ điều kiện check-in thủ công.',
        });
      }
      return applyCheckinTx(transaction, {
        bookingId: booking.id,
        staffUserId: input.staffUserId,
        method: 'MANUAL',
        tokenId: null,
        note: input.note.trim(),
        decidedAt,
      });
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
