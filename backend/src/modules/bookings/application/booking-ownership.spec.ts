import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Role } from '../../../enums/index.js';
import { BookingNotFoundError } from '../domain/booking-errors.js';
import { assertBookingOwnership } from '../domain/booking-ownership.js';
import { GetMyBookingUseCase } from './get-my-booking.use-case.js';
import {
  createFakeBookingStore,
  storedBooking,
} from './testing/booking-fixtures.js';

const { store, mocks } = createFakeBookingStore();
const useCase = new GetMyBookingUseCase(store);
const now = new Date('2035-01-08T00:00:00Z');

describe('booking ownership (IDOR)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocks.loadBookingOwner.mockResolvedValue('owner-1');
    mocks.databaseNow.mockResolvedValue(now);
    mocks.readBooking.mockResolvedValue(storedBooking());
  });

  it('lets the owner read their own booking', async () => {
    await expect(
      useCase.execute({ bookingId: 'booking', requesterUserId: 'owner-1' }),
    ).resolves.toMatchObject({ id: 'booking' });
    expect(mocks.readBooking).toHaveBeenCalled();
  });

  it('hides another user booking as 404 so ids cannot be probed', async () => {
    await expect(
      useCase.execute({ bookingId: 'booking', requesterUserId: 'user-2' }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
    expect(mocks.readBooking).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown booking id', async () => {
    mocks.loadBookingOwner.mockResolvedValue(undefined);
    await expect(
      useCase.execute({ bookingId: 'missing', requesterUserId: 'owner-1' }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
    expect(mocks.readBooking).not.toHaveBeenCalled();
  });

  it.each([Role.STAFF, Role.MANAGER, Role.ADMIN])(
    'lets %s read any booking for counter support',
    async (role) => {
      await expect(
        useCase.execute({
          bookingId: 'booking',
          requesterUserId: 'staff-1',
          requesterRoles: [role],
        }),
      ).resolves.toMatchObject({ id: 'booking' });
    },
  );

  it('denies a plain CUSTOMER reading someone else booking', async () => {
    await expect(
      useCase.execute({
        bookingId: 'booking',
        requesterUserId: 'user-2',
        requesterRoles: [Role.CUSTOMER],
      }),
    ).rejects.toBeInstanceOf(BookingNotFoundError);
  });

  it('denies guest (null-owner) bookings to anonymous member callers', () => {
    expect(() =>
      assertBookingOwnership({ ownerUserId: null, requesterUserId: 'user-2' }),
    ).toThrow(BookingNotFoundError);
  });
});
