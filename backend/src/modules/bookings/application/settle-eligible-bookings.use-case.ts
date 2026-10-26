import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../../payments/payment.constants.js';
import { MarkNoShowUseCase } from './mark-no-show.use-case.js';

/**
 * D03 — Settle sweep: tại/qua endsAt, CHECKED_IN → COMPLETED và
 * CONFIRMED (chưa check-in) → NO_SHOW + forfeiture.
 * - Idempotent + race-safe: mỗi đơn đi qua CAS đúng một lần; job chạy lại
 *   hoặc nhiều instance chỉ nhận replay (CONCURRENT cop → bỏ qua).
 * - Không tự suy NO_SHOW cho CANCELLED/EXPIRED/HOLDING.
 */
@Injectable()
export class SettleEligibleBookingsUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly markNoShow: MarkNoShowUseCase,
  ) {}

  async execute(
    limit = 100,
  ): Promise<{ completed: number; noShow: number; skipped: number }> {
    const [clock] = await this.prisma.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    const now = clock.now;
    let completed = 0;
    let noShow = 0;
    let skipped = 0;

    const dueComplete = await this.prisma.booking.findMany({
      where: { status: 'CHECKED_IN', endsAt: { lte: now } },
      select: { id: true },
      orderBy: { endsAt: 'asc' },
      take: limit,
    });
    for (const row of dueComplete) {
      try {
        const result = await this.completeOne(row.id, now);
        if (result === 'completed') completed += 1;
        else skipped += 1;
      } catch {
        skipped += 1;
      }
    }

    const dueNoShow = await this.prisma.booking.findMany({
      where: { status: 'CONFIRMED', endsAt: { lte: now } },
      select: { id: true },
      orderBy: { endsAt: 'asc' },
      take: limit,
    });
    for (const row of dueNoShow) {
      try {
        await this.markNoShow.execute({
          bookingId: row.id,
          idempotencyKey: `noshow-sweep:${row.id}:${now.toISOString().slice(0, 13)}`,
        });
        noShow += 1;
      } catch {
        skipped += 1;
      }
    }
    return { completed, noShow, skipped };
  }

  /**
   * CHECKED_IN quá endsAt → COMPLETED (CAS + history + outbox, không tiền).
   * Trả 'replayed' khi đã COMPLETED hoặc thua race.
   */
  private async completeOne(
    bookingId: string,
    now: Date,
  ): Promise<'completed' | 'replayed'> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('booking-money'), hashtext(${bookingId}))`;
      const booking = await transaction.booking.findUnique({
        where: { id: bookingId },
      });
      if (!booking) return 'replayed';
      if (String(booking.status) === 'COMPLETED') return 'replayed';
      if (
        String(booking.status) !== 'CHECKED_IN' ||
        !(now.getTime() >= booking.endsAt.getTime())
      ) {
        return 'replayed';
      }
      const changed = await transaction.booking.updateMany({
        where: {
          id: booking.id,
          status: 'CHECKED_IN',
          version: booking.version,
        },
        data: { status: 'COMPLETED', version: { increment: 1 } },
      });
      if (!changed.count) return 'replayed';
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'CHECKED_IN',
          toStatus: 'COMPLETED',
          actorType: 'SYSTEM',
          actorUserId: null,
          reason: 'Settle sweep: hết giờ sân, tự hoàn tất.',
        },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateType: 'BOOKING',
          aggregateId: booking.id,
          eventType: 'booking.completed',
          payload: { bookingId: booking.id, trigger: 'settle-sweep' },
        },
      });
      return 'completed';
    }, PAYMENT_TRANSACTION_OPTIONS);
  }
}
