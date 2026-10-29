import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { MINUTE_MS } from '../booking.constants.js';
import {
  BookingNotFoundError,
  BookingValidationError,
} from '../domain/booking-errors.js';
import {
  BookingStore,
  type StoredOccupancyKind,
} from '../ports/booking-store.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';

export const COURT_DAY_OCCUPANCIES_CACHE_TTL_SECONDS = 3;
export const COURT_DAY_OCCUPANCIES_CACHE_PREFIX = 'court_day_occupancies';
const COURT_DAY_OCCUPANCIES_GEN_PREFIX = 'court_day_occupancies_gen';

export interface CourtDayOccupanciesQuery {
  courtId: string;
  date: string;
}

export interface CourtDayOccupiedInterval {
  startsAt: Date;
  bufferEndsAt: Date;
  kind: StoredOccupancyKind;
  holdExpiresAt: Date | null;
}

export interface CourtDayOccupanciesView {
  courtId: string;
  date: string;
  timezone: string;
  serverNow: Date;
  cleanupMinutes: number;
  businessHours: {
    isClosed: boolean;
    open: string | null;
    close: string | null;
  };
  occupiedIntervals: CourtDayOccupiedInterval[];
}

interface CachedDayOccupancies {
  cachedAtMs: number;
  generation: number;
  cleanupMinutes: number;
  businessHours: CourtDayOccupanciesView['businessHours'];
  occupiedIntervals: Array<{
    startsAtMs: number;
    bufferEndsAtMs: number;
    kind: StoredOccupancyKind;
    holdExpiresAtMs: number | null;
  }>;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CourtScheduleHours {
  dayOfWeek: number;
  openTime: Date | string | null;
  closeTime: Date | string | null;
  isClosed: boolean;
}

export interface CourtScheduleSnapshot {
  id: string;
  cleanupMinutes: number;
  branch: { timezone: string; businessHours: CourtScheduleHours[] };
}

function toHourLabel(value: Date | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value.slice(0, 5);
  const hours = value.getUTCHours().toString().padStart(2, '0');
  const minutes = value.getUTCMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function courtDayCacheKey(courtId: string, date: string): string {
  return `${COURT_DAY_OCCUPANCIES_CACHE_PREFIX}:${courtId}:${date}`;
}

export function courtDayGenerationKey(courtId: string): string {
  return `${COURT_DAY_OCCUPANCIES_GEN_PREFIX}:${courtId}`;
}

/** Parse YYYY-MM-DD and reject non-existent calendar dates (2026-02-30). */
export function parseCourtDayDate(date: string): {
  year: number;
  month: number;
  day: number;
} {
  const match = DATE_PATTERN.exec(date);
  if (!match) throw new BookingValidationError('Định dạng ngày không hợp lệ.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const roundTrip = new Date(Date.UTC(year, month - 1, day));
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day
  ) {
    throw new BookingValidationError('Ngày không tồn tại trên lịch.');
  }
  return { year, month, day };
}

/**
 * Convert a wall-clock local date (or local date+time) in `timezone` to a UTC
 * instant. Iterates the Intl wall clock like the frontend `localInputToIso`
 * helper so DST gaps stay rejected instead of silently shifted.
 */
export function wallTimeToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): number {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let instant = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const rendered = wallClockParts(new Date(instant), timezone);
    const renderedMs = Date.UTC(
      rendered.year,
      rendered.month - 1,
      rendered.day,
      rendered.hour,
      rendered.minute,
    );
    instant += target - renderedMs;
  }
  const check = wallClockParts(new Date(instant), timezone);
  const matches =
    check.year === year &&
    check.month === month &&
    check.day === day &&
    check.hour === hour &&
    check.minute === minute;
  if (!matches)
    throw new BookingValidationError('Giờ địa phương không hợp lệ.');
  return instant;
}

function wallClockParts(
  instant: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const part = (key: string): number =>
    Number(parts.find((value) => value.type === key)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
  };
}

function toBusinessHoursView(
  schedule: { branch: { businessHours: CourtScheduleHours[] } },
  dateMs: number,
  timezone: string,
): CourtDayOccupanciesView['businessHours'] {
  const wall = wallClockParts(new Date(dateMs), timezone);
  const utcDay = new Date(
    Date.UTC(wall.year, wall.month - 1, wall.day),
  ).getUTCDay();
  const isoWeekday = utcDay === 0 ? 7 : utcDay;
  const hour = schedule.branch.businessHours.find(
    (entry) => entry.dayOfWeek === isoWeekday,
  );
  // No configured hours means the court cannot be booked that day: surface it
  // as explicitly closed instead of defaulting to open with null hours.
  if (!hour) return { isClosed: true, open: null, close: null };
  if (hour.isClosed) return { isClosed: true, open: null, close: null };
  return {
    isClosed: false,
    open: toHourLabel(hour.openTime),
    close: toHourLabel(hour.closeTime),
  };
}

function filterUnexpiredHolds(
  intervals: CachedDayOccupancies['occupiedIntervals'],
  serverNowMs: number,
): CourtDayOccupiedInterval[] {
  const visible: CourtDayOccupiedInterval[] = [];
  for (const interval of intervals) {
    if (
      interval.kind === 'HOLDING' &&
      interval.holdExpiresAtMs !== null &&
      interval.holdExpiresAtMs <= serverNowMs
    ) {
      continue;
    }
    visible.push({
      startsAt: new Date(interval.startsAtMs),
      bufferEndsAt: new Date(interval.bufferEndsAtMs),
      kind: interval.kind,
      holdExpiresAt:
        interval.holdExpiresAtMs === null
          ? null
          : new Date(interval.holdExpiresAtMs),
    });
  }
  return visible;
}

/**
 * Day-grid occupancy snapshot. Clean Architecture: only domain errors cross
 * this boundary; the presentation layer maps them to HTTP statuses.
 *
 * Cache contract (review v2.1 findings 1-2):
 * - Redis holds ONLY occupied intervals + schedule metadata (3s TTL).
 * - `serverNow` is always a fresh DB clock read, never cached, so PAST /
 *   TOO_SOON checks and HOLDING expiry filtering never use a stale timestamp.
 * - Cached HOLDING rows carry `holdExpiresAt`; rows past a fresh `serverNow`
 *   are filtered on every hit, including hits raced by natural expiry.
 * - Writes invalidate best-effort after commit; a missed invalidation still
 *   converges within the 3s TTL. The 18.5s figure in the concept is a
 *   conditional freshness target (poll + TTL + network when each stage runs
 *   within its budget), not a hard guarantee under failure/throttle.
 */
@Injectable()
export class GetCourtDayOccupanciesUseCase {
  private readonly logger = new Logger(GetCourtDayOccupanciesUseCase.name);

  constructor(
    private readonly bookings: BookingStore,
    private readonly schedule: CourtScheduleReader,
    @Optional() private readonly redis?: RedisService,
  ) {}

  async execute(
    query: CourtDayOccupanciesQuery,
  ): Promise<CourtDayOccupanciesView> {
    const { year, month, day } = parseCourtDayDate(query.date);
    return this.bookings.withTransaction(async (transaction, store) => {
      const now = await store.databaseNow(transaction);
      const court = await this.readSchedule(query.courtId, transaction);
      const timezone = court.branch.timezone;
      const dayStartMs = wallTimeToUtcMs(year, month, day, 0, 0, timezone);
      const nextDay = new Date(
        Date.UTC(year, month - 1, day) + 24 * 60 * MINUTE_MS,
      );
      const nextStartMs = wallTimeToUtcMs(
        nextDay.getUTCFullYear(),
        nextDay.getUTCMonth() + 1,
        nextDay.getUTCDate(),
        0,
        0,
        timezone,
      );
      const dayStart = new Date(dayStartMs);
      const queryEnd = new Date(nextStartMs + court.cleanupMinutes * MINUTE_MS);
      const businessHours = toBusinessHoursView(court, dayStartMs, timezone);

      const cached = await this.readCache(query.courtId, query.date);
      const generation = await this.readGeneration(query.courtId);
      if (cached && cached.generation === generation) {
        return {
          courtId: court.id,
          date: query.date,
          timezone,
          serverNow: now,
          cleanupMinutes: cached.cleanupMinutes,
          businessHours: cached.businessHours,
          occupiedIntervals: filterUnexpiredHolds(
            cached.occupiedIntervals,
            now.getTime(),
          ),
        };
      }

      const rows = await store.findEffectiveOccupanciesForRange(
        transaction,
        court.id,
        dayStart,
        queryEnd,
        now,
      );
      const occupiedIntervals: CourtDayOccupiedInterval[] = rows.map((row) => ({
        startsAt: row.startsAt,
        bufferEndsAt: row.bufferEndsAt,
        kind: row.kind,
        holdExpiresAt: row.holdExpiresAt,
      }));
      // Fencing: a mutation bumps the generation and deletes keys. If the
      // generation moved while this query ran, the snapshot may predate the
      // mutation, so skip the write instead of refilling a stale cache.
      const freshGeneration = await this.readGeneration(query.courtId);
      if (freshGeneration === generation) {
        await this.writeCache(query.courtId, query.date, {
          cachedAtMs: Date.now(),
          generation,
          cleanupMinutes: court.cleanupMinutes,
          businessHours,
          occupiedIntervals: occupiedIntervals.map((interval) => ({
            startsAtMs: interval.startsAt.getTime(),
            bufferEndsAtMs: interval.bufferEndsAt.getTime(),
            kind: interval.kind,
            holdExpiresAtMs: interval.holdExpiresAt
              ? interval.holdExpiresAt.getTime()
              : null,
          })),
        });
      }
      return {
        courtId: court.id,
        date: query.date,
        timezone,
        serverNow: now,
        cleanupMinutes: court.cleanupMinutes,
        businessHours,
        occupiedIntervals,
      };
    });
  }

  private async readSchedule(
    courtId: string,
    transaction: TransactionContext,
  ): Promise<CourtScheduleSnapshot> {
    try {
      return await this.schedule.getActiveSchedule(courtId, transaction);
    } catch (error: unknown) {
      // Only a known not-found maps to 404; infrastructure/DB failures keep
      // propagating so they are never disguised as "court not found".
      if (error instanceof NotFoundException) {
        throw new BookingNotFoundError('Không tìm thấy sân đang hoạt động.');
      }
      throw error;
    }
  }

  private async readGeneration(courtId: string): Promise<number> {
    if (!this.redis?.client?.isOpen) return 0;
    try {
      const raw = await this.redis.client.get(courtDayGenerationKey(courtId));
      const generation = Number(raw ?? 0);
      return Number.isInteger(generation) && generation >= 0 ? generation : 0;
    } catch (error: unknown) {
      this.logger.warn(
        `Day occupancies generation read failed: ${String(error)}`,
      );
      return 0;
    }
  }

  private async readCache(
    courtId: string,
    date: string,
  ): Promise<CachedDayOccupancies | null> {
    if (!this.redis?.client?.isOpen) return null;
    try {
      const raw = await this.redis.client.get(courtDayCacheKey(courtId, date));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedDayOccupancies;
      if (!Array.isArray(parsed?.occupiedIntervals)) return null;
      return parsed;
    } catch (error: unknown) {
      this.logger.warn(`Day occupancies cache read failed: ${String(error)}`);
      return null;
    }
  }

  private async writeCache(
    courtId: string,
    date: string,
    value: CachedDayOccupancies,
  ): Promise<void> {
    if (!this.redis?.client?.isOpen) return;
    try {
      await this.redis.client.set(
        courtDayCacheKey(courtId, date),
        JSON.stringify(value),
        {
          EX: COURT_DAY_OCCUPANCIES_CACHE_TTL_SECONDS,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(`Day occupancies cache write failed: ${String(error)}`);
    }
  }
}

/**
 * Best-effort invalidation after a hold mutation commits. Bumps the cache
 * generation BEFORE deleting keys so a concurrent stale read can neither
 * hit the deleted entry nor refill it afterwards (fenced by generation).
 * Fail-open: a missed invalidation still converges within the 3s TTL, so
 * cache failures never block the write path.
 */
export async function invalidateCourtDayCache(
  redis: RedisService | undefined,
  courtId: string,
): Promise<void> {
  if (!redis?.client?.isOpen) return;
  const prefix = `${COURT_DAY_OCCUPANCIES_CACHE_PREFIX}:${courtId}:`;
  try {
    await redis.client.incr(courtDayGenerationKey(courtId));
    let cursor = '0';
    do {
      const result = (await redis.client.scan(cursor, {
        MATCH: `${prefix}*`,
        COUNT: 50,
      })) as unknown as { cursor: string | number; keys: string[] };
      const keys = Array.isArray(result?.keys) ? result.keys : [];
      if (keys.length > 0) await redis.client.del(keys);
      cursor = String(result?.cursor ?? '0');
    } while (cursor !== '0');
  } catch {
    return;
  }
}
