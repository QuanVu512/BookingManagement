import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { CreateHoldUseCase } from '../src/modules/bookings/application/create-hold.use-case.js';
import { PrismaBookingStore } from '../src/modules/bookings/infrastructure/prisma-booking-store.js';
import { PrismaCourtScheduleReader } from '../src/modules/courts/infrastructure/prisma-court-schedule-reader.js';
import { GuestCreateHoldUseCase } from '../src/modules/payments/application/guest-create-hold.use-case.js';
import { PrismaGuestCheckoutStore } from '../src/modules/payments/infrastructure/prisma-guest-checkout-store.js';
import { GuestTokenService } from '../src/modules/payments/infrastructure/guest-token.service.js';
import {
  applyDepositMigration,
  applyHistoricalMigrations,
  applyRemainingMigrations,
  depositFixtures,
  insertSnapshot,
  openDepositDatabase,
} from './helpers/booking-deposit.fixture.js';

const databaseUrl = process.env.BOOKING_DEPOSIT_DATABASE_TEST_URL;
if (process.env.BOOKING_DEPOSIT_REQUIRE_STORAGE === 'true' && !databaseUrl) {
  throw new Error(
    'BOOKING_DEPOSIT_DATABASE_TEST_URL is required; no application DB fallback.',
  );
}
const storageDescribe = databaseUrl ? describe : describe.skip;

storageDescribe('Guest deposit migration on real isolated PostgreSQL', () => {
  let client: pg.Client;
  let prisma: PrismaService;
  let fixtures: Awaited<ReturnType<typeof depositFixtures>>;
  let member: CreateHoldUseCase;
  let guest: GuestCreateHoldUseCase;
  let store: PrismaBookingStore;
  let legacyIds: string[];
  let legacyBefore: string;
  let slot = 0;

  function holdInput() {
    const startsAt = new Date(Date.UTC(2035, 0, 8, 1 + slot++ * 2));
    return {
      courtId: fixtures.courtId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      idempotencyKey: randomUUID(),
      policyAccepted: true as const,
      userId: fixtures.userId,
      customerName: 'Synthetic guest',
      customerEmail: 'guest@example.test',
      customerPhone: '+84912345678',
    };
  }

  /** Bước 2: mỗi guest hold cần proof còn hạn + intent + recoverySecret. */
  async function guestIdentity(email = 'guest@example.test') {
    const otpProof = `gop_${randomBytes(32).toString('hex')}`;
    await prisma.guestOtpProof.create({
      data: {
        email,
        purpose: 'GUEST_HOLD_CREATE',
        tokenHash: createHash('sha256').update(otpProof).digest('hex'),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    return {
      otpProof,
      checkoutIntentId: randomUUID(),
      recoverySecret: randomBytes(32).toString('hex'),
    };
  }

  async function legacySnapshot() {
    return JSON.stringify(
      await prisma.booking.findMany({
        where: { id: { in: legacyIds } },
        orderBy: { id: 'asc' },
      }),
    );
  }

  beforeAll(async () => {
    client = await openDepositDatabase(databaseUrl ?? '');
    await applyHistoricalMigrations(client);
    const config = new ConfigService({ DATABASE_URL: databaseUrl });
    prisma = new PrismaService(config);
    await prisma.$connect();
    fixtures = await depositFixtures(prisma);
    store = new PrismaBookingStore(prisma);
    const schedule = new PrismaCourtScheduleReader();
    member = new CreateHoldUseCase(store, schedule);
    guest = new GuestCreateHoldUseCase(
      prisma,
      schedule,
      config,
      new PrismaGuestCheckoutStore(prisma),
      new GuestTokenService(prisma, config),
    );
    legacyIds = [];
    for (const userId of [fixtures.userId, null]) {
      legacyIds.push(
        await insertSnapshot(client, {
          ...fixtures,
          userId,
          percent: 100,
          required: 100005,
        }),
      );
    }
    legacyBefore = await legacySnapshot();
    await expect(
      insertSnapshot(client, {
        ...fixtures,
        userId: null,
        percent: 30,
        required: 30002,
      }),
    ).rejects.toMatchObject({
      code: '23514',
      constraint: 'bookings_guest_full_prepayment_check',
    });
    console.info(
      'Baseline reproduced: PostgreSQL 23514 bookings_guest_full_prepayment_check rejects guest 30%.',
    );
    await applyDepositMigration(client);
    await applyRemainingMigrations(client);
  }, 30_000);

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      await client?.end();
    }
  });

  it('refuses an existing nonempty database before running any migration', async () => {
    const before = await legacySnapshot();
    await expect(openDepositDatabase(databaseUrl ?? '')).rejects.toThrow(
      'NEW empty disposable database',
    );
    expect(await legacySnapshot()).toBe(before);
  });

  it.each([
    'postgresql://unused@production.example/booking_deposit_test',
    'postgresql://unused@127.0.0.1/booking_app',
  ])('refuses unsafe targets before connecting: %s', async (target) => {
    await expect(openDepositDatabase(target)).rejects.toThrow(
      'Only an explicit loopback booking_deposit_test',
    );
  });

  it('upgrades existing member/guest 100% snapshots without rewriting historical rows', async () => {
    expect(await legacySnapshot()).toBe(legacyBefore);
    for (const id of legacyIds) {
      const booking = await store.withTransaction((transaction) =>
        store.readBooking(transaction, id),
      );
      expect(booking).toMatchObject({
        prepaymentPercent: 100,
        totalAmount: 100005,
        requiredPrepaymentAmount: 100005,
      });
    }
    const result = await client.query(
      "SELECT conname FROM pg_constraint WHERE conrelid = 'public.bookings'::regclass AND conname = 'bookings_guest_full_prepayment_check'",
    );
    expect(result.rowCount).toBe(0);
  });

  it.each([
    ['member', undefined],
    ['member', 30],
    ['guest', undefined],
    ['guest', 30],
  ] as const)(
    'persists a %s hold with 30%% deposit (input=%s) using real use cases and Prisma',
    async (actor, percent) => {
      const base = { ...holdInput(), prepaymentPercent: percent };
      const result =
        actor === 'member'
          ? await member.execute(base)
          : await guest.execute({ ...base, ...(await guestIdentity()) });
      const id = 'bookingId' in result ? result.bookingId : result.id;
      const row = await prisma.booking.findUniqueOrThrow({ where: { id } });
      expect(row.prepaymentPercent.toNumber()).toBe(30);
      expect(row.totalAmount.toNumber()).toBe(100005);
      expect(row.requiredPrepaymentAmount.toNumber()).toBe(30002);
      expect(row.userId).toBe(actor === 'member' ? fixtures.userId : null);
      expect(
        await prisma.courtOccupancy.count({
          where: { bookingId: id, state: 'ACTIVE' },
        }),
      ).toBe(1);
      expect(
        await prisma.bookingStatusHistory.count({
          where: { bookingId: id, toStatus: 'HOLDING' },
        }),
      ).toBe(1);
      if (actor === 'guest') {
        expect(
          await prisma.bookingAccessToken.count({
            where: { bookingId: id, purpose: 'MANAGE_BOOKING' },
          }),
        ).toBe(1);
        expect(
          await prisma.bookingAccessToken.count({
            where: { bookingId: id, purpose: 'CHECKOUT_RECOVERY' },
          }),
        ).toBe(1);
      }
    },
  );

  it.each(['member', 'guest'] as const)(
    'rejects new %s 100%% holds at the active policy boundary without persisting rows',
    async (actor) => {
      const input = {
        ...holdInput(),
        prepaymentPercent: 100,
        // Guest phải có proof hợp lệ để chạm đúng biên chính sách 100%,
        // không bị chặn sớm bởi kiểm tra proof.
        ...(actor === 'guest' ? await guestIdentity() : {}),
      };
      const count = await prisma.booking.count();
      await expect(
        actor === 'member' ? member.execute(input) : guest.execute(input),
      ).rejects.toThrow();
      expect(await prisma.booking.count()).toBe(count);
    },
  );

  it.each([
    [50, 30002, 'bookings_prepayment_choice_check'],
    [30, 0, 'bookings_amounts_check'],
    [30, 100006, 'bookings_amounts_check'],
    [100, 30002, 'bookings_full_prepayment_amount_check'],
  ] as const)(
    'retains role-neutral monetary CHECKs for percent=%s required=%s',
    async (percent, required, constraint) => {
      for (const userId of [fixtures.userId, null]) {
        await expect(
          insertSnapshot(client, { ...fixtures, userId, percent, required }),
        ).rejects.toMatchObject({ code: '23514', constraint });
      }
    },
  );

  it('keeps the historical 100% snapshot usable for later status/version updates', async () => {
    await prisma.booking.update({
      where: { id: legacyIds[1] },
      data: { version: { increment: 1 } },
    });
    const row = await prisma.booking.findUniqueOrThrow({
      where: { id: legacyIds[1] },
    });
    expect(row.prepaymentPercent.toNumber()).toBe(100);
    expect(row.policyVersion).toBe('legacy-policy-v1');
    expect(row.requiredPrepaymentAmount.toNumber()).toBe(100005);
  });

  it('retains the PostgreSQL exclusion constraint and atomic rollback for a conflicting guest hold', async () => {
    // Giữ nguyên slot của lần gọi đầu: holdInput() tăng slot mỗi lần gọi nên
    // nếu lấy lại holdInput() sẽ không còn xung đột lịch.
    const input = { ...holdInput(), ...(await guestIdentity()) };
    const first = await guest.execute(input);
    const bookings = await prisma.booking.count();
    const tokens = await prisma.bookingAccessToken.count();
    await expect(
      guest.execute({
        ...input,
        ...(await guestIdentity()),
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await prisma.booking.count()).toBe(bookings);
    expect(await prisma.bookingAccessToken.count()).toBe(tokens);
    expect(
      await prisma.courtOccupancy.count({
        where: { bookingId: first.bookingId },
      }),
    ).toBe(1);
  });
});
