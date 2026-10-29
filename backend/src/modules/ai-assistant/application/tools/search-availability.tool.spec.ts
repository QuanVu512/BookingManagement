import { ListActiveCourtsUseCase } from '../../../courts/application/list-active-courts.use-case.js';
import type { ActiveCourtWithStartingPrice } from '../../../courts/application/models/court-read-models.js';
import { QuoteAvailabilityUseCase } from '../../../bookings/application/quote-availability.use-case.js';
import {
  SearchAvailabilityTool,
  type AvailabilitySearchInput,
} from './search-availability.tool.js';

function court(id: string, index: number): ActiveCourtWithStartingPrice {
  return {
    id,
    name: `Sân ${index}`,
    code: `C${index}`,
    courtType: index % 2 === 0 ? 'VIP' : 'STANDARD',
    status: 'ACTIVE',
    cleanupMinutes: 15,
    branchName: 'Chi nhánh 1',
    address: 'Địa chỉ 1',
    schedule: {
      timezone: 'Asia/Ho_Chi_Minh',
      rules: [],
    } as unknown as ActiveCourtWithStartingPrice['schedule'],
    startingPrice: 100_000,
  };
}

function buildTool(options: {
  courts: ActiveCourtWithStartingPrice[];
  busyIds?: string[];
  failingIds?: string[];
}) {
  const listActive = {
    execute: async () => options.courts,
  } as unknown as ListActiveCourtsUseCase;
  const quote = {
    execute: async (query: { courtId: string }) => {
      if (options.failingIds?.includes(query.courtId)) {
        throw new Error('provider timeout');
      }
      const busy = options.busyIds?.includes(query.courtId) ?? false;
      return {
        available: !busy,
        reason: busy ? 'bận' : null,
        serverNow: new Date(),
        timezone: 'Asia/Ho_Chi_Minh',
        cleanupMinutes: 15,
        occupiedUntil: new Date(),
        totalAmount: 100_000,
        currency: 'VND',
        priceItems: [],
      };
    },
  } as unknown as QuoteAvailabilityUseCase;
  return new SearchAvailabilityTool(listActive, quote);
}

const WINDOW: AvailabilitySearchInput = {
  startsAt: '2026-10-29T19:00:00+07:00',
  endsAt: '2026-10-29T20:00:00.000Z',
};

describe('SearchAvailabilityTool', () => {
  test('10 sân, 5 sân đầu đều bận: báo đúng coverage, không kết luận hết hệ thống', async () => {
    const courts = Array.from({ length: 10 }, (_, index) =>
      court(`court-${index + 1}`, index + 1),
    );
    const tool = buildTool({
      courts,
      busyIds: courts.slice(0, 5).map((item) => item.id),
    });
    const result = await tool.execute(WINDOW);
    expect(result.suggestions).toHaveLength(0);
    expect(result.coverage).toEqual({
      totalActiveCourts: 10,
      checkedCourtsCount: 5,
      failedCourtsCount: 0,
      availableCourtsCount: 0,
    });
  });

  test('1 trong 5 sân lỗi: failedCourtsCount = 1, lỗi không tính là bận', async () => {
    const courts = Array.from({ length: 5 }, (_, index) =>
      court(`court-${index + 1}`, index + 1),
    );
    const tool = buildTool({ courts, failingIds: ['court-1'] });
    const result = await tool.execute(WINDOW);
    expect(result.coverage.failedCourtsCount).toBe(1);
    expect(result.coverage.checkedCourtsCount).toBe(4);
    expect(result.coverage.availableCourtsCount).toBe(4);
    expect(result.suggestions.every((item) => item.courtId !== 'court-1')).toBe(
      true,
    );
  });

  test('suggestion có deep-link hợp lệ và tối đa 5 sân', async () => {
    const courts = Array.from({ length: 8 }, (_, index) =>
      court(`court-${index + 1}`, index + 1),
    );
    const tool = buildTool({ courts });
    const result = await tool.execute(WINDOW);
    expect(result.suggestions).toHaveLength(5);
    expect(result.suggestions[0].deepLink).toBe(
      `/courts/court-1?startsAt=${encodeURIComponent(WINDOW.startsAt)}&endsAt=${encodeURIComponent(WINDOW.endsAt)}`,
    );
    expect(result.suggestions[0].imageUrl).toBe('/courts/court-3.jpg');
  });

  test('lọc theo courtType VIP', async () => {
    const courts = Array.from({ length: 4 }, (_, index) =>
      court(`court-${index + 1}`, index + 1),
    );
    const tool = buildTool({ courts });
    const result = await tool.execute({ ...WINDOW, courtType: 'VIP' });
    expect(result.coverage.totalActiveCourts).toBe(2);
    expect(result.suggestions.every((item) => item.courtType === 'VIP')).toBe(
      true,
    );
  });

  test('window không hợp lệ bị từ chối', async () => {
    const tool = buildTool({ courts: [court('court-1', 1)] });
    await expect(
      tool.execute({ startsAt: 'not-a-date', endsAt: WINDOW.endsAt }),
    ).rejects.toThrow('INVALID_STARTS_AT');
    await expect(
      tool.execute({ startsAt: WINDOW.endsAt, endsAt: WINDOW.startsAt }),
    ).rejects.toThrow('INVALID_WINDOW');
  });
});
