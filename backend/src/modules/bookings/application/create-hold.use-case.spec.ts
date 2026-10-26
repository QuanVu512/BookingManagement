import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CreateHoldUseCase } from './create-hold.use-case.js';
import {
  BookingConflictError,
  BookingValidationError,
} from '../domain/booking-errors.js';
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
const command = {
  userId: 'user',
  courtId: 'court',
  startsAt: '2035-01-08T08:00:00+07:00',
  endsAt: '2035-01-08T09:00:00+07:00',
  idempotencyKey: 'key-12345678',
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

  it('serializes the request, expires the court, and persists one aggregate with mandatory 30% deposit', async () => {
    const result = await useCase.execute(command);
    expect(result.id).toBe('booking');
    expect(mocks.lockIdempotency).toHaveBeenCalledWith(
      expect.anything(),
      'user',
      command.idempotencyKey,
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
        prepaymentPercent: 30,
        requiredPrepaymentAmount: 30000,
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

  it('rejects unsupported prepayment percentages like 100 or 50', async () => {
    await expect(
      useCase.execute({ ...command, prepaymentPercent: 100 as unknown as number }),
    ).rejects.toBeInstanceOf(BookingValidationError);

    await expect(
      useCase.execute({ ...command, prepaymentPercent: 50 as unknown as number }),
    ).rejects.toBeInstanceOf(BookingValidationError);
  });

  it('replays the original booking without inserting another aggregate', async () => {
    mocks.findReplay.mockResolvedValue({
      id: 'existing',
      courtId: 'court',
      startsAt: new Date(command.startsAt),
      endsAt: new Date(command.endsAt),
      prepaymentPercent: 30,
    });
    const replayed = storedBooking({ id: 'existing', status: 'EXPIRED' });
    mocks.readBooking.mockResolvedValue(replayed);
    await expect(useCase.execute(command)).resolves.toBe(replayed);
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
      startsAt: new Date(command.startsAt),
      endsAt: new Date(command.endsAt),
    });
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      BookingConflictError,
    );
    expect(mocks.createHoldAggregate).not.toHaveBeenCalled();
  });

  it('rejects starts earlier than the five-minute hold boundary', async () => {
    mocks.databaseNow.mockResolvedValue(new Date('2035-01-08T00:58:00Z'));
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      BookingValidationError,
    );
  });

  it('maps an occupancy exclusion violation to a conflict', async () => {
    mocks.createHoldAggregate.mockRejectedValue(
      new Error('23P01 court_occupancies_no_active_overlap'),
    );
    await expect(useCase.execute(command)).rejects.toBeInstanceOf(
      BookingConflictError,
    );
  });

  it('rethrows unexpected persistence failures for the presenter to map', async () => {
    const failure = new Error('connection lost');
    mocks.createHoldAggregate.mockRejectedValue(failure);
    await expect(useCase.execute(command)).rejects.toBe(failure);
  });
});
