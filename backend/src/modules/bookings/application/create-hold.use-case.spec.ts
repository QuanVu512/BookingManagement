import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CreateHoldUseCase } from './create-hold.use-case.js';
import {
  courtQuote,
  courtSchedule,
  createFakeBookingStore,
  createFakeScheduleReader,
  storedBooking,
} from './testing/booking-fixtures.js';

const { schedule, mocks: scheduleMocks } = createFakeScheduleReader();
const { store, mocks } = createFakeBookingStore();
const useCase = new CreateHoldUseCase(store, schedule);
const input = {
  courtId: 'court',
  startsAt: '2035-01-08T08:00:00+07:00',
  endsAt: '2035-01-08T09:00:00+07:00',
  idempotencyKey: 'key-12345678',
  policyAccepted: true as const,
};

describe('CreateHoldUseCase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.findReplay.mockResolvedValue(null);
    mocks.databaseNow.mockResolvedValue(new Date('2035-01-08T00:00:00Z'));
    mocks.createHoldAggregate.mockResolvedValue('new-booking');
    mocks.readBooking.mockResolvedValue(storedBooking());
    scheduleMocks.getActiveSchedule.mockResolvedValue(courtSchedule());
    scheduleMocks.quote.mockReturnValue(courtQuote());
  });

  it('serializes the request, expires the court, and persists one aggregate', async () => {
    const result = await useCase.execute('user', input);
    expect(result.id).toBe('booking');
    expect(mocks.lockIdempotency).toHaveBeenCalledWith(
      expect.anything(),
      'user',
      input.idempotencyKey,
    );
    expect(mocks.expireEligibleHolds).toHaveBeenCalledWith(
      expect.anything(),
      { courtId: 'court' },
      expect.any(Date),
    );
    expect(mocks.createHoldAggregate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        courtId: 'court',
        totalAmount: 100001,
        requiredPrepaymentAmount: 100001,
      }),
      [
        expect.objectContaining({
          priceRuleId: 'rule',
          amount: 100001,
          pricePerHour: 100001,
        }),
      ],
    );
  });

  it('replays the original booking without inserting another aggregate', async () => {
    mocks.findReplay.mockResolvedValue({
      id: 'existing',
      courtId: 'court',
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    });
    const replayed = storedBooking({ id: 'existing', status: 'EXPIRED' });
    mocks.readBooking.mockResolvedValue(replayed);
    await expect(useCase.execute('user', input)).resolves.toBe(replayed);
    expect(mocks.expireEligibleHolds).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'existing' },
      expect.any(Date),
    );
    expect(mocks.createHoldAggregate).not.toHaveBeenCalled();
  });

  it('rejects a reused key with different booking data', async () => {
    mocks.findReplay.mockResolvedValue({
      id: 'existing',
      courtId: 'other-court',
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
    });
    await expect(useCase.execute('user', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(mocks.createHoldAggregate).not.toHaveBeenCalled();
  });

  it('rejects starts earlier than the five-minute hold boundary', async () => {
    mocks.databaseNow.mockResolvedValue(new Date('2035-01-08T00:58:00Z'));
    await expect(useCase.execute('user', input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('maps an occupancy exclusion violation to a conflict', async () => {
    mocks.createHoldAggregate.mockRejectedValue(
      new Error('23P01 court_occupancies_no_active_overlap'),
    );
    await expect(useCase.execute('user', input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('maps unexpected persistence failure to a retryable service error', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    mocks.createHoldAggregate.mockRejectedValue(new Error('connection lost'));
    await expect(useCase.execute('user', input)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
