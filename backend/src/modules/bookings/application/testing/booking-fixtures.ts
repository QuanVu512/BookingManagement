import { jest } from '@jest/globals';
import type { TransactionContext } from '../../../../infrastructure/prisma/transaction-context.js';
import type {
  CourtQuote,
  CourtSchedule,
  CourtScheduleReader,
} from '../../../courts/application/court-schedule-reader.js';
import { BookingStore, type StoredBooking } from '../../ports/booking-store.js';

const transaction: TransactionContext = Object.create(null);

export function createFakeBookingStore() {
  const lockIdempotency = jest.fn<BookingStore['lockIdempotency']>(
    async () => undefined,
  );
  const databaseNow = jest.fn<BookingStore['databaseNow']>(
    async () => new Date('2035-01-08T00:00:00Z'),
  );
  const findReplay = jest.fn<BookingStore['findReplay']>(async () => null);
  const expireEligibleHolds = jest.fn<BookingStore['expireEligibleHolds']>(
    async () => 0,
  );
  const loadCustomer = jest.fn<BookingStore['loadCustomer']>(async () => ({
    id: 'user',
    username: 'customer',
    email: 'customer@example.com',
    phone: '0900000000',
    fullName: 'Customer',
  }));
  const createHoldAggregate = jest.fn<BookingStore['createHoldAggregate']>(
    async () => 'new-booking',
  );
  const loadMine = jest.fn<BookingStore['loadMine']>(async () => ({
    bookings: [],
    nextCursor: null,
  }));
  const loadCancellationLookup = jest.fn<
    BookingStore['loadCancellationLookup']
  >(async () => null);
  const markCancelled = jest.fn<BookingStore['markCancelled']>(async () => 1);
  const releaseCancelled = jest.fn<BookingStore['releaseCancelled']>(
    async () => undefined,
  );
  const readBooking = jest.fn<BookingStore['readBooking']>(async () =>
    storedBooking(),
  );
  const hasEffectiveOccupancyConflict = jest.fn<
    BookingStore['hasEffectiveOccupancyConflict']
  >(async () => false);
  const store: BookingStore = {
    withTransaction: async <Result>(
      work: (
        transaction: TransactionContext,
        store: BookingStore,
      ) => Promise<Result>,
    ): Promise<Result> => work(transaction, store),
    lockIdempotency,
    databaseNow,
    findReplay,
    expireEligibleHolds,
    loadCustomer,
    createHoldAggregate,
    loadMine,
    loadCancellationLookup,
    markCancelled,
    releaseCancelled,
    readBooking,
    hasEffectiveOccupancyConflict,
  };
  return {
    store,
    mocks: {
      lockIdempotency,
      databaseNow,
      findReplay,
      expireEligibleHolds,
      loadCustomer,
      createHoldAggregate,
      loadMine,
      loadCancellationLookup,
      markCancelled,
      releaseCancelled,
      readBooking,
      hasEffectiveOccupancyConflict,
    },
  };
}

export function createFakeScheduleReader() {
  const getActiveSchedule = jest.fn<CourtScheduleReader['getActiveSchedule']>();
  const quote = jest.fn<CourtScheduleReader['quote']>();
  const schedule: CourtScheduleReader = { getActiveSchedule, quote };
  return { schedule, mocks: { getActiveSchedule, quote } };
}

export function courtSchedule(): CourtSchedule {
  return {
    id: 'court',
    branchId: 'branch',
    cleanupMinutes: 15,
    branch: { timezone: 'Asia/Ho_Chi_Minh', businessHours: [] },
    priceRules: [],
  };
}

export function courtQuote(): CourtQuote {
  return {
    items: [
      {
        priceRuleId: 'rule',
        startsAt: new Date('2035-01-08T01:00:00Z'),
        endsAt: new Date('2035-01-08T02:00:00Z'),
        durationMinutes: 60,
        pricePerHour: 100001,
        amount: 100001,
      },
    ],
    totalAmount: 100001,
  };
}

export function storedBooking(
  overrides: Partial<StoredBooking> = {},
): StoredBooking {
  return {
    id: 'booking',
    bookingCode: 'BK-test',
    courtId: 'court',
    courtName: 'Court',
    timezone: 'Asia/Ho_Chi_Minh',
    startsAt: new Date('2035-01-08T01:00:00Z'),
    endsAt: new Date('2035-01-08T02:00:00Z'),
    holdExpiresAt: new Date('2035-01-08T00:05:00Z'),
    status: 'HOLDING',
    totalAmount: 100001,
    currency: 'VND',
    priceItems: [
      {
        priceRuleId: 'rule',
        startsAt: new Date('2035-01-08T01:00:00Z'),
        endsAt: new Date('2035-01-08T02:00:00Z'),
        durationMinutes: 60,
        pricePerHour: 100001,
        amount: 100001,
      },
    ],
    ...overrides,
  };
}
