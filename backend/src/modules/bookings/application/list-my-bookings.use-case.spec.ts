import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ListMyBookingsUseCase } from './list-my-bookings.use-case.js';
import {
  createFakeBookingStore,
  storedBooking,
} from './testing/booking-fixtures.js';

const { store, mocks } = createFakeBookingStore();
const useCase = new ListMyBookingsUseCase(store);
const now = new Date('2035-01-08T00:00:00Z');

describe('ListMyBookingsUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.databaseNow.mockResolvedValue(now);
    mocks.loadMine.mockResolvedValue({
      bookings: [storedBooking()],
      nextCursor: 'next',
    });
  });

  it('expires only the owner holds before reading one page', async () => {
    const page = await useCase.execute('user', 'cursor');
    expect(mocks.expireEligibleHolds).toHaveBeenCalledWith(
      expect.anything(),
      { userId: 'user' },
      now,
    );
    expect(mocks.loadMine).toHaveBeenCalledWith(
      expect.anything(),
      'user',
      'cursor',
    );
    expect(page.bookings[0].id).toBe('booking');
    expect(page.nextCursor).toBe('next');
  });
});
