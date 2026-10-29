import { Injectable, Logger, Optional } from '@nestjs/common';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import { HOLD_DURATION_MS, MINUTE_MS } from '../booking.constants.js';
import { BookingStore } from '../ports/booking-store.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
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
  private readonly logger = new Logger(QuoteAvailabilityUseCase.name);

  constructor(
    private readonly bookings: BookingStore,
    private readonly schedule: CourtScheduleReader,
    @Optional() private readonly redis?: RedisService,
  ) {}

  /**
   * Read-only quote: it never transitions a hold. A HOLDING row past its
   * deadline is already treated as non-blocking by the store query, so the
   * request can safely run before the background worker catches up.
   * Results are cached in Redis with a short TTL (10s) to protect database
   * compute against rapid polling or spam clicks.
   */
  async execute(query: QuoteAvailabilityQuery): Promise<AvailabilityView> {
    const cacheKey = `avail:${query.courtId}:${query.startsAt}:${query.endsAt}`;
    if (this.redis?.client?.isOpen) {
      try {
        const cached = await this.redis.client.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          return {
            ...parsed,
            serverNow: new Date(parsed.serverNow),
            occupiedUntil: new Date(parsed.occupiedUntil),
            priceItems: (parsed.priceItems ?? []).map(
              (item: Record<string, unknown>) => ({
                ...item,
                startsAt: new Date(item.startsAt as string),
                endsAt: new Date(item.endsAt as string),
              }),
            ),
          };
        }
      } catch (err: unknown) {
        this.logger.warn(`Redis cache read failed for ${cacheKey}: ${err}`);
      }
    }

    const result = await this.bookings.withTransaction(async (transaction, store) => {
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

    if (this.redis?.client?.isOpen) {
      try {
        await this.redis.client.set(cacheKey, JSON.stringify(result), {
          EX: 10,
        });
      } catch (err: unknown) {
        this.logger.warn(`Redis cache write failed for ${cacheKey}: ${err}`);
      }
    }

    return result;
  }
}
