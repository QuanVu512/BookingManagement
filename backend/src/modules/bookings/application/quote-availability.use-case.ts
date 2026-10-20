import { Injectable } from '@nestjs/common';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import { HOLD_DURATION_MS, MINUTE_MS } from '../booking.constants.js';
import { BookingStore } from '../ports/booking-store.js';
import type { QuoteAvailabilityQuery } from './booking.commands.js';

export interface AvailabilityPriceItem {
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  pricePerHour: number;
  amount: number;
}

export interface AvailabilityView {
  available: boolean;
  reason: string | null;
  serverNow: Date;
  timezone: string;
  cleanupMinutes: number;
  occupiedUntil: Date;
  totalAmount: number;
  currency: string;
  priceItems: AvailabilityPriceItem[];
}

@Injectable()
export class QuoteAvailabilityUseCase {
  constructor(
    private readonly bookings: BookingStore,
    private readonly schedule: CourtScheduleReader,
  ) {}

  /**
   * Read-only quote: it never transitions a hold. A HOLDING row past its
   * deadline is already treated as non-blocking by the store query, so the
   * request can safely run before the background worker catches up.
   */
  execute(query: QuoteAvailabilityQuery): Promise<AvailabilityView> {
    return this.bookings.withTransaction(async (transaction, store) => {
      const now = await store.databaseNow(transaction);
      const court = await this.schedule.getActiveSchedule(
        query.courtId,
        transaction,
      );
      const startsAt = new Date(query.startsAt);
      const endsAt = new Date(query.endsAt);
      const quote = this.schedule.quote(court, startsAt, endsAt);
      const occupiedUntil = new Date(
        endsAt.getTime() + court.cleanupMinutes * MINUTE_MS,
      );
      const conflict = await store.hasEffectiveOccupancyConflict(
        transaction,
        query.courtId,
        startsAt,
        occupiedUntil,
        now,
      );
      const tooSoon = startsAt.getTime() - now.getTime() < HOLD_DURATION_MS;
      return {
        available: !conflict && !tooSoon,
        reason: conflict
          ? 'Khoảng sân đã được giữ, bao gồm thời gian vệ sinh.'
          : tooSoon
            ? 'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.'
            : null,
        serverNow: now,
        timezone: court.branch.timezone,
        cleanupMinutes: court.cleanupMinutes,
        occupiedUntil,
        totalAmount: quote.totalAmount,
        currency: 'VND',
        priceItems: quote.items,
      };
    });
  }
}
