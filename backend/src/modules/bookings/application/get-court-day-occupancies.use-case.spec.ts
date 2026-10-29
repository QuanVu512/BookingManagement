import {
  GetCourtDayOccupanciesUseCase,
  invalidateCourtDayCache,
  parseCourtDayDate,
} from './get-court-day-occupancies.use-case';
import {
  BookingNotFoundError,
  BookingValidationError,
} from '../domain/booking-errors';
import { NotFoundException } from '@nestjs/common';
import { presentCourtDayOccupancies } from '../presentation/booking-response.presenter';

function mockStore(options: {
  now: Date;
  rows: Array<{
    startsAt: Date;
    bufferEndsAt: Date;
    kind: 'HOLDING' | 'CONFIRMED' | 'MAINTENANCE';
    holdExpiresAt: Date | null;
  }>;
  captured: { rangeStart?: Date; rangeEnd?: Date };
}) {
  return {
    withTransaction: async (
      work: (tx: object, store: object) => Promise<never>,
    ) =>
      work(
        {},
        {
          databaseNow: async () => options.now,
          findEffectiveOccupanciesForRange: async (
            _tx: object,
            _courtId: string,
            rangeStart: Date,
            rangeEnd: Date,
          ) => {
            options.captured.rangeStart = rangeStart;
            options.captured.rangeEnd = rangeEnd;
            return options.rows;
          },
        },
      ),
  };
}

function mockSchedule(court?: {
  id: string;
  cleanupMinutes: number;
  branch: {
    timezone: string;
    businessHours: Array<{
      dayOfWeek: number;
      openTime: string | null;
      closeTime: string | null;
      isClosed: boolean;
    }>;
  };
}) {
  return {
    getActiveSchedule: async () => {
      if (!court)
        throw new NotFoundException('Không tìm thấy sân đang hoạt động.');
      return court;
    },
    quote: () => ({ items: [], totalAmount: 0 }),
  };
}

const COURT = {
  id: 'court-1',
  cleanupMinutes: 15,
  branch: {
    timezone: 'Asia/Ho_Chi_Minh',
    businessHours: [
      { dayOfWeek: 3, openTime: '06:00', closeTime: '23:00', isClosed: false },
    ],
  },
};

describe('GetCourtDayOccupanciesUseCase', () => {
  it('rejects non-existent calendar dates without touching the store', async () => {
    expect(() => parseCourtDayDate('2026-02-30')).toThrow(
      BookingValidationError,
    );
    const useCase = new GetCourtDayOccupanciesUseCase(
      mockStore({ now: new Date(), rows: [], captured: {} }) as never,
      mockSchedule(COURT) as never,
    );
    await expect(
      useCase.execute({ courtId: 'court-1', date: '2026-02-30' }),
    ).rejects.toBeInstanceOf(BookingValidationError);
  });

  it('rejects malformed dates with a domain error (no HTTP import)', async () => {
    const useCase = new GetCourtDayOccupanciesUseCase(
      mockStore({ now: new Date(), rows: [], captured: {} }) as never,
      mockSchedule(COURT) as never,
    );
    await expect(
      useCase.execute({ courtId: 'court-1', date: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BookingValidationError);
  });

  it('maps an inactive court to BookingNotFoundError (domain only)', async () => {
    const useCase = new GetCourtDayOccupanciesUseCase(
      mockStore({ now: new Date(), rows: [], captured: {} }) as never,
      mockSchedule(undefined) as never,
    );
    await expect(
      useCase.execute({ courtId: 'court-1', date: '2026-10-29' }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });

  it('queries the half-open window [dayStart, nextDayStart + cleanup)', async () => {
    const captured: { rangeStart?: Date; rangeEnd?: Date } = {};
    const useCase = new GetCourtDayOccupanciesUseCase(
      mockStore({
        now: new Date('2026-10-28T00:00:00Z'),
        rows: [],
        captured,
      }) as never,
      mockSchedule(COURT) as never,
    );
    // 2026-10-29 is a Thursday (dayOfWeek 4); add an entry so hours resolve.
    const courtThursday = {
      ...COURT,
      branch: {
        ...COURT.branch,
        businessHours: [
          {
            dayOfWeek: 4,
            openTime: '06:00',
            closeTime: '23:00',
            isClosed: false,
          },
        ],
      },
    };
    const thursdayCase = new GetCourtDayOccupanciesUseCase(
      mockStore({
        now: new Date('2026-10-28T00:00:00Z'),
        rows: [],
        captured,
      }) as never,
      mockSchedule(courtThursday) as never,
    );
    const view = await thursdayCase.execute({
      courtId: 'court-1',
      date: '2026-10-29',
    });
    expect(view.date).toBe('2026-10-29');
    expect(view.cleanupMinutes).toBe(15);
    expect(captured.rangeStart?.toISOString()).toBe('2026-10-28T17:00:00.000Z');
    // Next-day midnight ICT (2026-10-30T00:00+07) + 15min cleanup.
    expect(captured.rangeEnd?.toISOString()).toBe('2026-10-29T17:15:00.000Z');
    expect(view.businessHours).toEqual({
      isClosed: false,
      open: '06:00',
      close: '23:00',
    });
    expect(useCase).toBeDefined();
  });

  it('lets infrastructure DB errors propagate instead of masking as 404', async () => {
    const failingSchedule = {
      getActiveSchedule: async () => {
        throw new Error('connection terminated');
      },
      quote: () => ({ items: [], totalAmount: 0 }),
    };
    const useCase = new GetCourtDayOccupanciesUseCase(
      mockStore({ now: new Date(), rows: [], captured: {} }) as never,
      failingSchedule as never,
    );
    await expect(
      useCase.execute({ courtId: 'court-1', date: '2026-10-29' }),
    ).rejects.toThrow('connection terminated');
  });

  it('ignores a stale-generation cache and skips refilling after invalidation', async () => {
    const memory = new Map<string, string>();
    const fakeRedis = {
      client: {
        isOpen: true,
        get: async (key: string) => memory.get(key) ?? null,
        set: async (key: string, value: string) => {
          memory.set(key, value);
        },
        incr: async (key: string) => {
          const next = Number(memory.get(key) ?? 0) + 1;
          memory.set(key, String(next));
          return next;
        },
        scan: async (cursor: string, options?: { MATCH?: string }) => {
          const pattern = (options?.MATCH ?? '').replace(/\*$/, '');
          return {
            cursor: '0',
            keys: [...memory.keys()].filter((key) => key.startsWith(pattern)),
          };
        },
        del: async (keys: string[]) => {
          for (const key of keys) memory.delete(key);
        },
      },
    };
    const courtThursday = {
      ...COURT,
      branch: {
        ...COURT.branch,
        businessHours: [
          {
            dayOfWeek: 4,
            openTime: '06:00',
            closeTime: '23:00',
            isClosed: false,
          },
        ],
      },
    };
    const staleCached = {
      cachedAtMs: Date.now(),
      generation: 0,
      cleanupMinutes: 15,
      businessHours: { isClosed: false, open: '06:00', close: '23:00' },
      occupiedIntervals: [],
    };
    // A mutation bumped the generation while a gen-0 entry is still stored:
    // the stale entry must be ignored and the DB re-queried.
    memory.set(
      'court_day_occupancies:court-1:2026-10-29',
      JSON.stringify(staleCached),
    );
    memory.set('court_day_occupancies_gen:court-1', '1');
    let queries = 0;
    const store = mockStore({
      now: new Date('2026-10-28T00:00:00Z'),
      rows: [],
      captured: {},
    });
    const countingStore = {
      ...store,
      withTransaction: async (
        work: (tx: object, s: object) => Promise<never>,
      ) =>
        work(
          {},
          {
            databaseNow: async () => new Date('2026-10-28T00:00:00Z'),
            findEffectiveOccupanciesForRange: async () => {
              queries += 1;
              return [];
            },
          },
        ),
    };
    const useCase = new GetCourtDayOccupanciesUseCase(
      countingStore as never,
      mockSchedule(courtThursday) as never,
      fakeRedis as never,
    );
    await useCase.execute({ courtId: 'court-1', date: '2026-10-29' });
    expect(queries).toBe(1);
    expect(
      JSON.parse(memory.get('court_day_occupancies:court-1:2026-10-29') ?? '')
        .generation,
    ).toBe(1);

    // A mutation landing mid-query bumps the generation again: the snapshot
    // may predate it, so the refill must be skipped, not cached.
    await invalidateCourtDayCache(fakeRedis as never, 'court-1');
    const racingStore = {
      withTransaction: async (
        work: (tx: object, s: object) => Promise<never>,
      ) =>
        work(
          {},
          {
            databaseNow: async () => new Date('2026-10-28T00:00:00Z'),
            findEffectiveOccupanciesForRange: async () => {
              queries += 1;
              await invalidateCourtDayCache(fakeRedis as never, 'court-1');
              return [];
            },
          },
        ),
    };
    const racingCase = new GetCourtDayOccupanciesUseCase(
      racingStore as never,
      mockSchedule(courtThursday) as never,
      fakeRedis as never,
    );
    await racingCase.execute({ courtId: 'court-1', date: '2026-10-29' });
    expect(queries).toBe(2);
    expect(
      memory.get('court_day_occupancies:court-1:2026-10-29'),
    ).toBeUndefined();
  });

  it('keeps a CONFIRMED slot occupied after the old hold expiry passes', async () => {
    const memory = new Map<string, string>();
    const fakeRedis = {
      client: {
        isOpen: true,
        get: async (key: string) => memory.get(key) ?? null,
        set: async (key: string, value: string) => {
          memory.set(key, value);
        },
        incr: async (key: string) => {
          const next = Number(memory.get(key) ?? 0) + 1;
          memory.set(key, String(next));
          return next;
        },
        scan: async (cursor: string, options?: { MATCH?: string }) => {
          const pattern = (options?.MATCH ?? '').replace(/\*$/, '');
          return {
            cursor: '0',
            keys: [...memory.keys()].filter((key) => key.startsWith(pattern)),
          };
        },
        del: async (keys: string[]) => {
          for (const key of keys) memory.delete(key);
        },
      },
    };
    const courtThursday = {
      ...COURT,
      branch: {
        ...COURT.branch,
        businessHours: [
          {
            dayOfWeek: 4,
            openTime: '06:00',
            closeTime: '23:00',
            isClosed: false,
          },
        ],
      },
    };
    const holdExpiresAt = new Date('2026-10-29T02:00:00.000Z');
    let currentRows = [
      {
        startsAt: new Date('2026-10-29T01:00:00.000Z'),
        bufferEndsAt: new Date('2026-10-29T02:15:00.000Z'),
        kind: 'HOLDING' as const,
        holdExpiresAt,
      },
    ];
    let currentNow = new Date('2026-10-28T00:00:00Z');
    let queries = 0;
    const sequencingStore = {
      withTransaction: async (
        work: (tx: object, s: object) => Promise<never>,
      ) =>
        work(
          {},
          {
            databaseNow: async () => currentNow,
            findEffectiveOccupanciesForRange: async () => {
              queries += 1;
              return currentRows;
            },
          },
        ),
    };
    const useCase = new GetCourtDayOccupanciesUseCase(
      sequencingStore as never,
      mockSchedule(courtThursday) as never,
      fakeRedis as never,
    );
    // 1. Initial read caches the HOLDING snapshot (gen 0).
    const first = await useCase.execute({
      courtId: 'court-1',
      date: '2026-10-29',
    });
    expect(first.occupiedIntervals).toHaveLength(1);
    expect(queries).toBe(1);

    // 2. Payment confirms the booking before expiry: the confirm path
    // invalidates the day-grid cache (same helper the coordinator calls).
    currentRows = [
      {
        startsAt: new Date('2026-10-29T01:00:00.000Z'),
        bufferEndsAt: new Date('2026-10-29T02:15:00.000Z'),
        kind: 'CONFIRMED' as const,
        holdExpiresAt: null,
      },
    ];
    await invalidateCourtDayCache(fakeRedis as never, 'court-1');

    // 3. A later read after the old hold expiry must still show the slot as
    // occupied — without invalidation the expiry filter would drop the
    // stale HOLDING row and wrongly free the court.
    currentNow = new Date('2026-10-29T03:00:00.000Z');
    const second = await useCase.execute({
      courtId: 'court-1',
      date: '2026-10-29',
    });
    expect(queries).toBe(2);
    expect(second.occupiedIntervals).toHaveLength(1);
    expect(second.occupiedIntervals[0]?.kind).toBe('CONFIRMED');
  });

  it('presents zero PII: only bounds + kind cross the wire', async () => {
    const captured: { rangeStart?: Date; rangeEnd?: Date } = {};
    const rows = [
      {
        startsAt: new Date('2026-10-29T01:00:00.000Z'),
        bufferEndsAt: new Date('2026-10-29T02:15:00.000Z'),
        kind: 'HOLDING' as const,
        holdExpiresAt: new Date('2026-10-29T03:00:00.000Z'),
      },
    ];
    const courtThursday = {
      ...COURT,
      branch: {
        ...COURT.branch,
        businessHours: [
          {
            dayOfWeek: 4,
            openTime: '06:00',
            closeTime: '23:00',
            isClosed: false,
          },
        ],
      },
    };
    const useCase = new GetCourtDayOccupanciesUseCase(
      mockStore({
        now: new Date('2026-10-28T00:00:00Z'),
        rows,
        captured,
      }) as never,
      mockSchedule(courtThursday) as never,
    );
    const view = await useCase.execute({
      courtId: 'court-1',
      date: '2026-10-29',
    });
    const presented = presentCourtDayOccupancies(view);
    expect(presented.occupiedIntervals).toEqual([
      {
        startsAt: '2026-10-29T01:00:00.000Z',
        bufferEndsAt: '2026-10-29T02:15:00.000Z',
        kind: 'HOLDING',
      },
    ]);
    const serialized = JSON.stringify(presented);
    expect(serialized).not.toMatch(/userId|phone|email|customer/i);
  });
});
