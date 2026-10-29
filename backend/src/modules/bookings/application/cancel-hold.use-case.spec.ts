import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CancelHoldUseCase } from './cancel-hold.use-case.js';
import {
  BookingConflictError,
  BookingNotFoundError,
} from '../domain/booking-errors.js';
import {
  createFakeBookingStore,
  storedBooking,
} from './testing/booking-fixtures.js';

const { store, mocks } = createFakeBookingStore();
const useCase = new CancelHoldUseCase(store);
const command = { userId: 'user', bookingId: 'booking' };
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
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      BookingNotFoundError,
    );
    expect(mocks.markCancelled).not.toHaveBeenCalled();
  });

  it('returns an already expired booking with its stored state', async () => {
    mocks.loadCancellationLookup.mockResolvedValue({
      booking: { ...target, status: 'EXPIRED' },
      now,
    });
    mocks.readBooking.mockResolvedValue(storedBooking({ status: 'EXPIRED' }));
    await expect(useCase.execute(command)).resolves.toMatchObject({
      status: 'EXPIRED',
    });
    expect(mocks.markCancelled).not.toHaveBeenCalled();
    expect(mocks.releaseCancelled).not.toHaveBeenCalled();
  });

  it('returns an already cancelled booking without another transition', async () => {
    mocks.loadCancellationLookup.mockResolvedValue({
      booking: { ...target, status: 'CANCELLED' },
      now,
    });
    await expect(useCase.execute(command)).resolves.toMatchObject({
      status: 'CANCELLED',
    });
    expect(mocks.markCancelled).not.toHaveBeenCalled();
    expect(mocks.releaseCancelled).not.toHaveBeenCalled();
  });

  it('cancels conditionally, then releases occupancy and appends history', async () => {
    await useCase.execute(command);
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
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      BookingConflictError,
    );
    expect(mocks.releaseCancelled).not.toHaveBeenCalled();
  });

  it('invalidates the populated day-grid cache after a successful cancel', async () => {
    const memory = new Map<string, string>([
      ['court_day_occupancies:court:2035-01-08', '{"occupiedIntervals":[]}'],
    ]);
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
    const invalidatingCase = new CancelHoldUseCase(store, fakeRedis as never);
    await invalidatingCase.execute(command);
    expect(
      memory.get('court_day_occupancies:court:2035-01-08'),
    ).toBeUndefined();
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
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      BookingConflictError,
    );
    expect(mocks.markCancelled).not.toHaveBeenCalled();
  });
});
