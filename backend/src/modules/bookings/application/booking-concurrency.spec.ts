import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CreateHoldUseCase } from './create-hold.use-case.js';
import { BookingConflictError } from '../domain/booking-errors.js';
import { buildSlotLockKey } from '../domain/booking-slot-key.js';
import type { BookingSlotLock } from '../ports/booking-slot-lock.js';
import {
  courtQuote,
  courtSchedule,
  createFakeBookingStore,
  createFakeScheduleReader,
  createFakeSlotLock,
  storedBooking,
} from './testing/booking-fixtures.js';

const command = {
  userId: 'user-a',
  courtId: 'court-1',
  startsAt: '2035-01-08T08:00:00+07:00',
  endsAt: '2035-01-08T09:00:00+07:00',
  idempotencyKey: 'concurrency-key-01',
};
const expectedKey = 'lock:court:court-1:2035-01-08:0100-0200';

function setup(lock?: BookingSlotLock) {
  const { schedule, mocks: scheduleMocks } = createFakeScheduleReader();
  const { store, mocks } = createFakeBookingStore();
  mocks.findReplay.mockResolvedValue(null);
  mocks.databaseNow.mockResolvedValue(new Date('2035-01-08T00:00:00Z'));
  mocks.createHoldAggregate.mockResolvedValue('new-booking');
  mocks.readBooking.mockResolvedValue(storedBooking());
  scheduleMocks.getActiveSchedule.mockResolvedValue(courtSchedule());
  scheduleMocks.quote.mockReturnValue(courtQuote());
  const useCase = new CreateHoldUseCase(store, schedule, lock);
  return { useCase, mocks };
}

describe('CreateHoldUseCase slot lock (concurrency)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('derives one Redis key per court/date/slot', () => {
    expect(
      buildSlotLockKey(command.courtId, command.startsAt, command.endsAt),
    ).toBe(expectedKey);
  });

  it('lets exactly one of two concurrent holds on the same slot succeed', async () => {
    // Both contenders share one lock (one Redis) but use distinct
    // idempotency keys so replay logic cannot mask the race.
    const { lock } = createFakeSlotLock();
    const first = setup(lock);
    const second = setup(lock);
    second.mocks.createHoldAggregate.mockResolvedValue('other-booking');

    const results = await Promise.allSettled([
      first.useCase.execute(command),
      second.useCase.execute({
        ...command,
        userId: 'user-b',
        idempotencyKey: 'concurrency-key-02',
      }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
      BookingConflictError,
    );
    const inserts =
      first.mocks.createHoldAggregate.mock.calls.length +
      second.mocks.createHoldAggregate.mock.calls.length;
    expect(inserts).toBe(1);
  });

  it('returns 409 without touching the DB when the slot is already held', async () => {
    const { lock } = createFakeSlotLock();
    const inFlight = await lock.acquire(expectedKey, 8000);
    expect(inFlight).not.toBeNull();
    try {
      const { useCase, mocks } = setup(lock);
      await expect(useCase.execute(command)).rejects.toBeInstanceOf(
        BookingConflictError,
      );
      expect(mocks.createHoldAggregate).not.toHaveBeenCalled();
    } finally {
      await inFlight!.release();
    }
  });

  it('always releases the lock, even when the transaction fails', async () => {
    const { lock, releasedKeys } = createFakeSlotLock();
    const { useCase, mocks } = setup(lock);
    const failure = new Error('connection lost');
    mocks.createHoldAggregate.mockRejectedValue(failure);
    await expect(useCase.execute(command)).rejects.toBe(failure);
    expect(releasedKeys).toEqual([expectedKey]);
  });

  it('proceeds via the DB exclusion backstop when Redis itself fails', async () => {
    const broken: BookingSlotLock = {
      acquire: async () => {
        throw new Error('Redis down');
      },
    };
    const { useCase, mocks } = setup(broken);
    await expect(useCase.execute(command)).resolves.toMatchObject({
      id: 'booking',
    });
    expect(mocks.createHoldAggregate).toHaveBeenCalledTimes(1);
  });
});
