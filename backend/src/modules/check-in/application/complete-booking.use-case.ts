import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';

export interface CompleteBookingResult {
  bookingId: string;
  bookingCode: string;
  status: 'COMPLETED';
  completedAt: Date;
  replayed: boolean;
}

/**
 * C11 — Hoàn tất đơn đã CHECKED_IN khi slot đã kết thúc (giờ DB).
 * - Chỉ CHECKED_IN→COMPLETED, CAS theo version; không chạm ledger tiền.
 * - KHÔNG tự động chạy theo lịch và KHÔNG xử lý NO_SHOW ở đây: cả hai còn
 *   chờ D03 (auto-schedule? no-show fee?). Job/staff gọi tường minh.
 */
@Injectable()
export class CompleteBookingUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: {
    bookingId: string;
    actorUserId: string | null;
    actorType: 'STAFF' | 'SYSTEM';
  }): Promise<CompleteBookingResult> {
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
      if (String(booking.status) === 'COMPLETED') {
        return {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          status: 'COMPLETED' as const,
          completedAt: booking.updatedAt,
          replayed: true,
        };
      }
      if (String(booking.status) !== 'CHECKED_IN') {
        throw new ConflictException({
          code: 'NOT_CHECKED_IN',
          message: 'Chỉ đơn đã check-in mới được hoàn tất.',
        });
      }
      if (!(decidedAt.getTime() >= booking.endsAt.getTime())) {
        throw new ConflictException({
          code: 'COMPLETION_TOO_EARLY',
          message: 'Chưa hết giờ sân — chưa thể hoàn tất.',
        });
      }
      const changed = await transaction.booking.updateMany({
        where: {
          id: booking.id,
          status: 'CHECKED_IN',
          version: booking.version,
        },
        data: {
          status: 'COMPLETED',
          version: { increment: 1 },
        },
      });
      if (!changed.count) {
        throw new ConflictException({
          code: 'CONCURRENT_TRANSITION',
          message: 'Đơn vừa thay đổi — hãy tải lại và thử lại.',
        });
      }
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'CHECKED_IN',
          toStatus: 'COMPLETED',
          actorType: input.actorType,
          actorUserId: input.actorUserId,
          reason: 'Kết thúc giờ sân, đơn hoàn tất.',
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'BOOKING',
          aggregateId: booking.id,
          eventType: 'booking.completed',
          payload: { bookingId: booking.id },
        },
      });
      return {
        bookingId: booking.id,
        bookingCode: booking.bookingCode,
        status: 'COMPLETED' as const,
        completedAt: decidedAt,
        replayed: false,
      };
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
