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
const query = {
  courtId: 'court',
  startsAt: '2035-01-08T08:00:00+07:00',
  endsAt: '2035-01-08T09:00:00+07:00',
};
const now = new Date('2035-01-08T00:00:00Z');

describe('QuoteAvailabilityUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.databaseNow.mockResolvedValue(now);
    mocks.hasEffectiveOccupancyConflict.mockResolvedValue(false);
    scheduleMocks.getActiveSchedule.mockResolvedValue(courtSchedule());
    scheduleMocks.quote.mockReturnValue(courtQuote());
  });

  it('quotes the window without mutating stored holds', async () => {
    const result = await useCase.execute(query);
    expect(mocks.expireEligibleHolds).not.toHaveBeenCalled();
    expect(mocks.hasEffectiveOccupancyConflict).toHaveBeenCalledWith(
      expect.anything(),
      'court',
      new Date(query.startsAt),
      new Date(new Date(query.endsAt).getTime() + 15 * 60_000),
      now,
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

  it('reports an effective occupancy conflict, including the cleanup buffer', async () => {
    mocks.hasEffectiveOccupancyConflict.mockResolvedValue(true);
    const result = await useCase.execute(query);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('thời gian vệ sinh');
  });

  it('rejects windows starting inside the five-minute boundary', async () => {
    mocks.databaseNow.mockResolvedValue(new Date('2035-01-08T00:56:00Z'));
    const result = await useCase.execute(query);
    expect(result.available).toBe(false);
    expect(result.reason).toContain('5 phút');
  });

  it('rechecks occupancy and database time after a hold expires', async () => {
    mocks.hasEffectiveOccupancyConflict
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    expect((await useCase.execute(query)).available).toBe(false);
    expect((await useCase.execute(query)).available).toBe(true);
    expect(mocks.databaseNow).toHaveBeenCalledTimes(2);
  });
});
