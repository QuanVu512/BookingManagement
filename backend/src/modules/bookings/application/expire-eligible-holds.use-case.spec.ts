import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExpireEligibleHoldsUseCase } from './expire-eligible-holds.use-case.js';
import { createFakeBookingStore } from './testing/booking-fixtures.js';

const { store, mocks } = createFakeBookingStore();
const useCase = new ExpireEligibleHoldsUseCase(store);
const now = new Date('2035-01-08T00:00:00Z');

describe('ExpireEligibleHoldsUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.databaseNow.mockResolvedValue(now);
  });

  it('transitions expired holds in bounded batches until a short batch', async () => {
    mocks.expireEligibleHolds
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    await expect(useCase.execute(2)).resolves.toBe(5);

    expect(mocks.expireEligibleHolds).toHaveBeenCalledTimes(3);
    expect(mocks.expireEligibleHolds).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      {},
      now,
      2,
    );
    expect(mocks.databaseNow).toHaveBeenCalledTimes(3);
  });

  it('stops after one batch when nothing else is eligible', async () => {
    mocks.expireEligibleHolds.mockResolvedValueOnce(0);

    await expect(useCase.execute(100)).resolves.toBe(0);

    expect(mocks.expireEligibleHolds).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-positive batch size before touching storage', async () => {
    await expect(useCase.execute(0)).rejects.toThrow(
      'batchSize must be a positive integer.',
    );
    expect(mocks.expireEligibleHolds).not.toHaveBeenCalled();
  });
});
