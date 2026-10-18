import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CancelHoldUseCase } from './cancel-hold.use-case.js';
import {
  createFakeBookingStore,
  storedBooking,
} from './testing/booking-fixtures.js';

const { store, mocks } = createFakeBookingStore();
const useCase = new CancelHoldUseCase(store);
const now = new Date('2035-01-08T00:00:00Z');
const target = {
  status: 'HOLDING',
  version: 1,
  startsAt: new Date('2035-01-08T01:00:00Z'),
  hasCheckin: false,
};

describe('CancelHoldUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.loadCancellationLookup.mockResolvedValue({
      booking: target,
      now,
    });
    mocks.markCancelled.mockResolvedValue(1);
    mocks.readBooking.mockResolvedValue(storedBooking({ status: 'CANCELLED' }));
  });

  it('hides bookings owned by another account', async () => {
    mocks.loadCancellationLookup.mockResolvedValue(null);
    await expect(useCase.execute('user', 'booking')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(mocks.markCancelled).not.toHaveBeenCalled();
  });

  it('returns an already final booking without another transition', async () => {
    mocks.loadCancellationLookup.mockResolvedValue({
      booking: { ...target, status: 'EXPIRED' },
      now,
    });
    await expect(useCase.execute('user', 'booking')).resolves.toMatchObject({
      status: 'CANCELLED',
    });
    expect(mocks.markCancelled).not.toHaveBeenCalled();
    expect(mocks.releaseCancelled).not.toHaveBeenCalled();
  });

  it('cancels conditionally, then releases occupancy and appends history', async () => {
    await useCase.execute('user', 'booking');
    expect(mocks.markCancelled).toHaveBeenCalledWith(
      expect.anything(),
      'booking',
      'user',
      1,
      now,
    );
    expect(mocks.releaseCancelled).toHaveBeenCalledWith(
      expect.anything(),
      'booking',
      'user',
      now,
    );
  });

  it('reports a stale version instead of overwriting a concurrent change', async () => {
    mocks.markCancelled.mockResolvedValue(0);
    await expect(useCase.execute('user', 'booking')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mocks.releaseCancelled).not.toHaveBeenCalled();
  });

  it.each([
    [
      'already started',
      { ...target, startsAt: new Date('2035-01-07T23:00:00Z') },
    ],
    ['checked in', { ...target, hasCheckin: true }],
    ['not holding', { ...target, status: 'CONFIRMED' }],
  ])('refuses cancellation when the booking is %s', async (_case, booking) => {
    mocks.loadCancellationLookup.mockResolvedValue({ booking, now });
    await expect(useCase.execute('user', 'booking')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mocks.markCancelled).not.toHaveBeenCalled();
  });
});
