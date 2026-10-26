import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import {
  checkinEligibility,
  readCheckinWindow,
} from '../domain/checkin-eligibility.js';
import { readCheckinMoney } from './checkin-money.js';

export type CheckinActorType = 'CUSTOMER' | 'GUEST';

export interface MintCheckinTokenResult {
  tokenId: string;
  /** Raw token trả MỘT lần để vé render QR; DB chỉ giữ hash. */
  checkinToken: string;
  bookingId: string;
  expiresAt: Date;
}

/**
 * C10 — Cấp token CHECKIN cho chủ đơn (member CONFIRMED / guest bound).
 * - Fail-closed khi cửa sổ D02 chưa cấu hình: 503, không đoán giờ.
 * - Token hết hạn = endsAt của slot (fact booking, không policy mới).
 * - Thu hồi các CHECKIN chưa dùng trước đó của cùng đơn.
 */
@Injectable()
export class MintCheckinTokenUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async execute(input: {
    bookingId: string;
    actorUserId: string | null;
    actorType: CheckinActorType;
    guestBookingId?: string;
  }): Promise<MintCheckinTokenResult> {
    const window = readCheckinWindow((name) => this.config.get<string>(name));
    if (!window) {
      throw new ServiceUnavailableException({
        code: 'CHECKIN_DISABLED',
        message:
          'Cửa sổ check-in đang cấu hình không hợp lệ — liên hệ quầy hỗ trợ.',
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
        throw new ConflictException({
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
            message: 'Không có quyền lấy mã check-in đơn này.',
          });
        }
      } else if (
        booking.userId === null ||
        booking.userId !== input.actorUserId
      ) {
        throw new ForbiddenException({
          code: 'NOT_YOUR_BOOKING',
          message: 'Không có quyền lấy mã check-in đơn này.',
        });
      }
      if (String(booking.status) !== 'CONFIRMED') {
        throw new ConflictException({
          code: 'NOT_CONFIRMED',
          message: 'Chỉ đơn đã xác nhận mới được lấy mã check-in.',
        });
      }
      const existing = await transaction.bookingCheckin.findUnique({
        where: { bookingId: booking.id },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException({
          code: 'ALREADY_CHECKED_IN',
          message: 'Đơn đã được check-in.',
        });
      }
      const total = Number(booking.totalAmount.toString());
      const money = await readCheckinMoney(transaction, booking.id, total);
      const eligibility = checkinEligibility({
        status: String(booking.status),
        netCredited: money.netCredited,
        totalAmount: total,
        hasCheckin: false,
        nowMs: decidedAt.getTime(),
        startsAtMs: booking.startsAt.getTime(),
        endsAtMs: booking.endsAt.getTime(),
        window,
      });
      if (!eligibility.eligible) {
        throw new ConflictException({
          code: eligibility.code,
          message: 'Đơn chưa đủ điều kiện check-in.',
        });
      }
      // Thu hồi CHECKIN cũ chưa dùng để mỗi thời điểm chỉ một mã hiệu lực.
      await transaction.bookingAccessToken.updateMany({
        where: {
          bookingId: booking.id,
          purpose: 'CHECKIN',
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: decidedAt },
      });
      const rawToken = randomBytes(32).toString('hex');
      const created = await transaction.bookingAccessToken.create({
        data: {
          bookingId: booking.id,
          purpose: 'CHECKIN',
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          expiresAt: booking.endsAt,
        },
        select: { id: true },
      });
      return {
        tokenId: created.id,
        checkinToken: rawToken,
        bookingId: booking.id,
        expiresAt: booking.endsAt,
      };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
