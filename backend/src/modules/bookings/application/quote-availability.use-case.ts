import { Injectable } from '@nestjs/common';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import { HOLD_DURATION_MS, MINUTE_MS } from '../booking.constants.js';
import type { BookingWindowDto } from '../presentation/dto/booking-request.dto.js';
import { BookingStore } from '../ports/booking-store.js';

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

  execute(
    courtId: string,
    window: BookingWindowDto,
  ): Promise<AvailabilityView> {
    return this.bookings.withTransaction(async (transaction, store) => {
      const now = await store.databaseNow(transaction);
      await store.expireEligibleHolds(transaction, { courtId }, now);
      const court = await this.schedule.getActiveSchedule(courtId, transaction);
      const startsAt = new Date(window.startsAt);
      const endsAt = new Date(window.endsAt);
      const quote = this.schedule.quote(court, startsAt, endsAt);
      const occupiedUntil = new Date(
        endsAt.getTime() + court.cleanupMinutes * MINUTE_MS,
      );
      const conflict = await store.hasActiveOccupancyConflict(
        transaction,
        courtId,
        startsAt,
        occupiedUntil,
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
