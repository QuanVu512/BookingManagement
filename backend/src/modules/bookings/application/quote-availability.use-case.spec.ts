import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QuoteAvailabilityUseCase } from './quote-availability.use-case.js';
import {
  courtQuote,
  courtSchedule,
  createFakeBookingStore,
  createFakeScheduleReader,
} from './testing/booking-fixtures.js';

const { schedule, mocks: scheduleMocks } = createFakeScheduleReader();
const { store, mocks } = createFakeBookingStore();
const useCase = new QuoteAvailabilityUseCase(store, schedule);
const window = {
  startsAt: '2035-01-08T08:00:00+07:00',
  endsAt: '2035-01-08T09:00:00+07:00',
};

describe('QuoteAvailabilityUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.databaseNow.mockResolvedValue(new Date('2035-01-08T00:00:00Z'));
    mocks.hasActiveOccupancyConflict.mockResolvedValue(false);
    scheduleMocks.getActiveSchedule.mockResolvedValue(courtSchedule());
    scheduleMocks.quote.mockReturnValue(courtQuote());
  });

  it('expires holds before quoting the same court-specific window', async () => {
    const result = await useCase.execute('court', window);
    expect(mocks.expireEligibleHolds).toHaveBeenCalledWith(
      expect.anything(),
      { courtId: 'court' },
      expect.any(Date),
    );
    expect(scheduleMocks.getActiveSchedule).toHaveBeenCalledWith(
      'court',
      expect.anything(),
    );
    expect(result).toMatchObject({
      available: true,
      reason: null,
      timezone: 'Asia/Ho_Chi_Minh',
      cleanupMinutes: 15,
      totalAmount: 100001,
      currency: 'VND',
    });
    expect(result.priceItems[0]).toMatchObject({
      durationMinutes: 60,
      pricePerHour: 100001,
      amount: 100001,
    });
  });

  it('reports the occupancy and cleanup-buffer conflict', async () => {
    mocks.hasActiveOccupancyConflict.mockResolvedValue(true);
    const result = await useCase.execute('court', window);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('thời gian vệ sinh');
    expect(mocks.hasActiveOccupancyConflict).toHaveBeenCalledWith(
      expect.anything(),
      'court',
      new Date(window.startsAt),
      new Date(new Date(window.endsAt).getTime() + 15 * 60_000),
    );
  });

  it('rejects windows starting inside the five-minute boundary', async () => {
    mocks.databaseNow.mockResolvedValue(new Date('2035-01-08T00:56:00Z'));
    const result = await useCase.execute('court', window);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('5 phút');
  });
});
