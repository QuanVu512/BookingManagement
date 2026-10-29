import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  BOOKING_TRANSACTION_OPTIONS,
  MAX_BOOKINGS_PER_PAGE,
  MINUTE_MS,
} from '../booking.constants.js';
import {
  BookingStore,
  type BookingDraft,
  type BookingPage,
  type BookingPriceLine,
  type CancellationLookup,
  type CustomerSnapshot,
  type ExpiryScope,
  type ReplayBooking,
  type StoredBooking,
  type StoredOccupancyInterval,
} from '../ports/booking-store.js';

const bookingInclude = {
  court: { select: { name: true } },
  branch: { select: { timezone: true } },
  priceItems: { orderBy: { startsAt: 'asc' } },
} satisfies Prisma.BookingInclude;

type BookingWithPresentation = Prisma.BookingGetPayload<{
  include: typeof bookingInclude;
}>;

@Injectable()
export class PrismaBookingStore extends BookingStore {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly transaction?: TransactionContext,
  ) {
    super();
  }

  withTransaction<Result>(
    work: (
      transaction: TransactionContext,
      store: BookingStore,
    ) => Promise<Result>,
  ): Promise<Result> {
    return this.prisma.$transaction(
      (transaction) =>
        work(transaction, new PrismaBookingStore(this.prisma, transaction)),
      BOOKING_TRANSACTION_OPTIONS,
    );
  }

  async lockIdempotency(
    transaction: TransactionContext,
    userId: string,
    idempotencyKey: string,
  ): Promise<void> {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}), hashtext(${idempotencyKey}))`;
  }

  async databaseNow(transaction: TransactionContext): Promise<Date> {
    const [clock] = await transaction.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return clock.now;
  }

  async findReplay(
    transaction: TransactionContext,
    userId: string,
    idempotencyKey: string,
  ): Promise<ReplayBooking | null> {
    const row = await transaction.booking.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      select: {
        id: true,
        courtId: true,
        startsAt: true,
        endsAt: true,
        prepaymentPercent: true,
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      courtId: row.courtId,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      prepaymentPercent: row.prepaymentPercent.toNumber(),
    };
  }

  // Conditional update owns the transition. Concurrent readers/cancellations
  // cannot add a second history entry or release a newly created occupancy.
  async expireEligibleHolds(
    transaction: TransactionContext,
    scope: ExpiryScope,
    now: Date,
    limit?: number,
  ): Promise<number> {
    const expired = await transaction.booking.findMany({
      where: { ...scope, status: 'HOLDING', holdExpiresAt: { lte: now } },
      select: { id: true },
      orderBy: { id: 'asc' },
      ...(limit === undefined ? {} : { take: limit }),
    });
    let transitioned = 0;
    for (const booking of expired) {
      // BLK-03: booking đã có receipt VERIFIED do coordinator xử lý (kèm
      // obligations) — legacy sweep bỏ qua để không mất tiền.
      const credited = await transaction.paymentTransaction.findFirst({
        where: {
          paymentRequest: { referenceId: booking.id },
          verificationStatus: 'VERIFIED',
        },
        select: { id: true },
      });
      if (credited) continue;
      const changed = await transaction.booking.updateMany({
        where: {
          id: booking.id,
          status: 'HOLDING',
          holdExpiresAt: { lte: now },
        },
        data: { status: 'EXPIRED', version: { increment: 1 } },
      });
      if (!changed.count) continue;
      transitioned += 1;
      await transaction.courtOccupancy.updateMany({
        where: { bookingId: booking.id, state: 'ACTIVE' },
        data: { state: 'RELEASED', releasedAt: now },
      });
      await transaction.bookingStatusHistory.create({
        data: {
          bookingId: booking.id,
          fromStatus: 'HOLDING',
          toStatus: 'EXPIRED',
          actorType: 'SYSTEM',
          reason: 'Hết hạn giữ chỗ 5 phút.',
        },
      });
    }
    return transitioned;
  }

  async loadCustomer(
    transaction: TransactionContext,
    userId: string,
  ): Promise<CustomerSnapshot> {
    const customer = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      include: { profile: true },
    });
    return {
      id: customer.id,
      username: customer.username,
      email: customer.email,
      phone: customer.phone,
      fullName: customer.profile?.fullName ?? null,
    };
  }

  async createHoldAggregate(
    transaction: TransactionContext,
    draft: BookingDraft,
    priceLines: BookingPriceLine[],
  ): Promise<string> {
    const booking = await transaction.booking.create({
      data: {
        ...draft,
        source: 'CUSTOMER_WEB',
        status: 'HOLDING',
        prepaymentPercent: draft.prepaymentPercent,
        cancellationRule: 'BEFORE_START',
      },
    });
    if (priceLines.length)
      await transaction.bookingPriceItem.createMany({
        data: priceLines.map((line) => ({ ...line, bookingId: booking.id })),
      });
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        toStatus: 'HOLDING',
        actorType: 'CUSTOMER',
        actorUserId: booking.userId,
      },
    });
    await transaction.courtOccupancy.create({
      data: {
        bookingId: booking.id,
        courtId: booking.courtId,
        kind: 'BOOKING',
        occupiedFrom: booking.startsAt,
        occupiedUntil: new Date(
          booking.endsAt.getTime() + booking.cleanupMinutes * MINUTE_MS,
        ),
      },
    });
    return booking.id;
  }

  async loadMine(
    transaction: TransactionContext,
    userId: string,
    cursor?: string,
  ): Promise<BookingPage> {
    const bookings = await transaction.booking.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_BOOKINGS_PER_PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: bookingInclude,
    });
    const hasMore = bookings.length > MAX_BOOKINGS_PER_PAGE;
    const page = bookings.slice(0, MAX_BOOKINGS_PER_PAGE);
    return {
      bookings: page.map(toStoredBooking),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async loadBookingOwner(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<string | null | undefined> {
    const row = await transaction.booking.findUnique({
      where: { id: bookingId },
      select: { userId: true },
    });
    return row?.userId;
  }

  async loadCancellationLookup(
    transaction: TransactionContext,
    bookingId: string,
    userId: string,
  ): Promise<CancellationLookup | null> {
    const owned = await transaction.booking.findFirst({
      where: { id: bookingId, userId },
      select: { id: true },
    });
    if (!owned) return null;
    const now = await this.databaseNow(transaction);
    await this.expireEligibleHolds(transaction, { id: bookingId }, now);
    const booking = await transaction.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { checkin: true },
    });
    return {
      now,
      booking: {
        status: booking.status,
        version: booking.version,
        startsAt: booking.startsAt,
        hasCheckin: booking.checkin !== null,
      },
    };
  }

  async markCancelled(
    transaction: TransactionContext,
    bookingId: string,
    userId: string,
    version: number,
    now: Date,
  ): Promise<number> {
    const changed = await transaction.booking.updateMany({
      where: {
        id: bookingId,
        userId,
        status: 'HOLDING',
        version,
      },
      data: {
        status: 'CANCELLED',
        cancelledAt: now,
        cancelledByUserId: userId,
        version: { increment: 1 },
      },
    });
    return changed.count;
  }

  async releaseCancelled(
    transaction: TransactionContext,
    bookingId: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    await transaction.courtOccupancy.updateMany({
      where: { bookingId, state: 'ACTIVE' },
      data: { state: 'RELEASED', releasedAt: now },
    });
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId,
        fromStatus: 'HOLDING',
        toStatus: 'CANCELLED',
        actorType: 'CUSTOMER',
        actorUserId: userId,
      },
    });
  }

  async findEffectiveOccupanciesForRange(
    transaction: TransactionContext,
    courtId: string,
    rangeStart: Date,
    rangeEnd: Date,
    now: Date,
  ): Promise<StoredOccupancyInterval[]> {
    const rows = await transaction.courtOccupancy.findMany({
      where: {
        courtId,
        state: 'ACTIVE',
        occupiedFrom: { lt: rangeEnd },
        occupiedUntil: { gt: rangeStart },
        OR: [
          { bookingId: null },
          { booking: { is: { status: { not: 'HOLDING' } } } },
          {
            booking: {
              is: { status: 'HOLDING', holdExpiresAt: { gt: now } },
            },
          },
        ],
      },
      select: {
        occupiedFrom: true,
        occupiedUntil: true,
        bookingId: true,
        booking: { select: { status: true, holdExpiresAt: true } },
      },
      orderBy: { occupiedFrom: 'asc' },
    });
    return rows.map((row) => ({
      startsAt: row.occupiedFrom,
      // occupiedUntil already includes the court cleanup snapshot: never add
      // buffer a second time when mapping or comparing intervals.
      bufferEndsAt: row.occupiedUntil,
      kind:
        row.bookingId === null
          ? 'MAINTENANCE'
          : row.booking?.status === 'HOLDING'
            ? 'HOLDING'
            : 'CONFIRMED',
      holdExpiresAt:
        row.booking?.status === 'HOLDING'
          ? (row.booking.holdExpiresAt ?? null)
          : null,
    }));
  }

  async readBooking(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<StoredBooking> {
    return toStoredBooking(
      await transaction.booking.findUniqueOrThrow({
        where: { id: bookingId },
        include: bookingInclude,
      }),
    );
  }

  async hasEffectiveOccupancyConflict(
    transaction: TransactionContext,
    courtId: string,
    startsAt: Date,
    occupiedUntil: Date,
    now: Date,
  ): Promise<boolean> {
    // CourtOccupancy has no holdExpiresAt; expiry lives on Booking. Joining the
    // relation keeps an out-of-date ACTIVE row from blocking a read-only quote.
    const conflict = await transaction.courtOccupancy.findFirst({
      where: {
        courtId,
        state: 'ACTIVE',
        occupiedFrom: { lt: occupiedUntil },
        occupiedUntil: { gt: startsAt },
        OR: [
          { bookingId: null },
          { booking: { is: { status: { not: 'HOLDING' } } } },
          {
            booking: {
              is: { status: 'HOLDING', holdExpiresAt: { gt: now } },
            },
          },
        ],
      },
      select: { id: true },
    });
    return conflict !== null;
  }
}

function toStoredBooking(booking: BookingWithPresentation): StoredBooking {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,
    courtId: booking.courtId,
    courtName: booking.court.name,
    timezone: booking.branch.timezone,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    holdExpiresAt: booking.holdExpiresAt,
    status: booking.status,
    totalAmount: booking.totalAmount.toNumber(),
    prepaymentPercent: booking.prepaymentPercent.toNumber(),
    requiredPrepaymentAmount: booking.requiredPrepaymentAmount.toNumber(),
    currency: booking.currency,
    priceItems: booking.priceItems.map((item) => ({
      priceRuleId: item.priceRuleId,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      durationMinutes: item.durationMinutes,
      pricePerHour: item.pricePerHour.toNumber(),
      amount: item.amount.toNumber(),
    })),
  };
}
