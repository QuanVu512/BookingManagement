import 'reflect-metadata';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { JwtService } from '@nestjs/jwt';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { QueueEvents, type Queue } from 'bullmq';
import { randomBytes, randomUUID } from 'node:crypto';
import { BookingExpiryModule } from '../src/modules/bookings/booking-expiry.module.js';
import {
  BOOKING_EXPIRY_JOB,
  BOOKING_EXPIRY_QUEUE,
  MAX_BOOKING_EXPIRY_INTERVAL_MS,
} from '../src/modules/bookings/booking.constants.js';
import { BookingsModule } from '../src/modules/bookings/bookings.module.js';
import { CourtsModule } from '../src/modules/courts/courts.module.js';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisModule } from '../src/infrastructure/redis/redis.module.js';
import { AuthMailService } from '../src/modules/auth/services/auth-mail.service.js';
import { REQUEST_VALIDATION_OPTIONS } from '../src/constants/validation.constants.js';
import { securityHeaders } from '../src/common/security-http.js';

interface BookingPayload {
  id: string;
  bookingCode: string;
  courtId: string;
  courtName: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  holdExpiresAt: string;
  status: string;
  totalAmount: number;
  currency: string;
  priceItems: { amount: number }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBooking(value: unknown): value is BookingPayload {
  if (!isRecord(value)) return false;
  return (
    [
      'id',
      'bookingCode',
      'courtId',
      'courtName',
      'timezone',
      'startsAt',
      'endsAt',
      'holdExpiresAt',
      'status',
      'currency',
    ].every((key) => typeof value[key] === 'string') &&
    typeof value.totalAmount === 'number' &&
    Array.isArray(value.priceItems) &&
    value.priceItems.every(
      (item) => isRecord(item) && typeof item.amount === 'number',
    )
  );
}

const databaseUrl = process.env.BOOKING_DATABASE_TEST_URL;
const redisUrl = process.env.BOOKING_REDIS_TEST_URL;
if (
  process.env.BOOKING_REQUIRE_STORAGE === 'true' &&
  (!databaseUrl || !redisUrl)
)
  throw new Error(
    'Booking integration requires explicit disposable PostgreSQL and Redis URLs.',
  );
const storageDescribe = databaseUrl && redisUrl ? describe : describe.skip;
const ORIGIN = 'http://127.0.0.1:4001';
const instant = (time: string) =>
  new Date(`2035-01-08T${time}:00+07:00`).toISOString();
const timeOnly = (time: string) => new Date(`1970-01-01T${time}:00Z`);
const userA = randomUUID();
const userB = randomUUID();
const branchId = randomUUID();
const courtId = randomUUID();

storageDescribe(
  'Booking HTTP + real PostgreSQL constraints, JWT and Redis CSRF',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;
    let base: string;
    let tokenA: string;
    let tokenB: string;
    let expiryQueue: Queue;
    let queueEvents: QueueEvents;
    let csrf = '';
    let cookie = '';
    beforeAll(async () => {
      const database = new URL(databaseUrl ?? '');
      const redis = new URL(redisUrl ?? '');
      if (
        !['127.0.0.1', 'localhost'].includes(database.hostname) ||
        database.pathname !== '/booking_mvp_test' ||
        !['127.0.0.1', 'localhost'].includes(redis.hostname)
      )
        throw new Error(
          'Only loopback booking_mvp_test and explicit test Redis are allowed.',
        );
      const redisConnection = {
        host: redis.hostname,
        port: Number(redis.port || '6379'),
        password: redis.password
          ? decodeURIComponent(redis.password)
          : undefined,
      };
      const module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                NODE_ENV: 'test',
                DATABASE_URL: databaseUrl,
                REDIS_URL: redisUrl,
                REDIS_HOST: redisConnection.host,
                REDIS_PORT: String(redisConnection.port),
                REDIS_PASSWORD: redisConnection.password,
                // Use the longest supported interval; the worker itself is
                // triggered explicitly by the integration test.
                BOOKING_EXPIRY_INTERVAL_MS: String(
                  MAX_BOOKING_EXPIRY_INTERVAL_MS,
                ),
                BOOKING_EXPIRY_BATCH_SIZE: '10',
                JWT_SECRET: randomBytes(32).toString('hex'),
                WEB_ORIGIN: ORIGIN,
              }),
            ],
          }),
          PrismaModule,
          RedisModule,
          CourtsModule,
          BookingsModule,
          BookingExpiryModule,
        ],
      })
        .overrideProvider(AuthMailService)
        .useValue({ sendToken: async () => undefined })
        .compile();
      app = module.createNestApplication();
      app.use(securityHeaders);
      app.useGlobalPipes(new ValidationPipe(REQUEST_VALIDATION_OPTIONS));
      await app.listen(0, '127.0.0.1');
      base = await app.getUrl();
      prisma = app.get(PrismaService);
      expiryQueue = app.get<Queue>(getQueueToken(BOOKING_EXPIRY_QUEUE));
      queueEvents = new QueueEvents(BOOKING_EXPIRY_QUEUE, {
        connection: redisConnection,
      });
      await queueEvents.waitUntilReady();
      await expiryQueue.drain();
      const jwt = app.get(JwtService);
      tokenA = jwt.sign({ sub: userA, jti: randomUUID(), tokenVersion: 0 });
      tokenB = jwt.sign({ sub: userB, jti: randomUUID(), tokenVersion: 0 });
      await fixtures(prisma);
      const response = await fetch(`${base}/api/auth/csrf`);
      const payload: unknown = await response.json();
      if (
        typeof payload !== 'object' ||
        !payload ||
        !('token' in payload) ||
        typeof payload.token !== 'string'
      )
        throw new Error('Missing CSRF fixture.');
      csrf = payload.token;
      cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    }, 30_000);
    beforeEach(async () => {
      await clearBookings(prisma);
      await prisma.court.update({
        where: { id: courtId },
        data: { status: 'ACTIVE' },
      });
      await prisma.branch.update({
        where: { id: branchId },
        data: { isActive: true },
      });
      await prisma.priceRule.updateMany({
        where: { courtId },
        data: { isActive: true },
      });
    });
    afterAll(async () => {
      await queueEvents?.close();
      if (prisma) {
        await clearBookings(prisma);
        await prisma.priceRule.deleteMany({ where: { courtId } });
        await prisma.court.deleteMany({ where: { id: courtId } });
        await prisma.branchBusinessHour.deleteMany({ where: { branchId } });
        await prisma.branch.deleteMany({ where: { id: branchId } });
        await prisma.user.deleteMany({ where: { id: { in: [userA, userB] } } });
      }
      await app?.close();
    });

    function input(start = '08:00', end = '09:00', key = randomUUID()) {
      return {
        courtId,
        startsAt: instant(start),
        endsAt: instant(end),
        idempotencyKey: key,
        policyAccepted: true,
      };
    }
    async function http(
      path: string,
      method = 'GET',
      body?: unknown,
      token = tokenA,
      withCsrf = true,
    ) {
      return fetch(`${base}/api/${path}`, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          Origin: ORIGIN,
          ...(withCsrf ? { 'X-CSRF-Token': csrf, Cookie: cookie } : {}),
          'Content-Type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    }
    async function create(payload = input(), token = tokenA) {
      const response = await http('bookings', 'POST', payload, token);
      const body: unknown = await response.json();
      if (
        response.status !== 201 ||
        typeof body !== 'object' ||
        !body ||
        !('data' in body) ||
        !isBooking(body.data)
      )
        throw new Error(
          `Create failed ${response.status}: ${JSON.stringify(body)}`,
        );
      return body.data;
    }
    async function availability(start = '08:00', end = '09:00') {
      return http(
        `courts/${courtId}/availability?${new URLSearchParams({ startsAt: instant(start), endsAt: instant(end) })}`,
      );
    }

    it('persists HOLDING, complete price/history/occupancy atomically with a 300s DB deadline', async () => {
      const booking = await create();
      const stored = await prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
        include: { priceItems: true, statusHistory: true, occupancies: true },
      });
      expect(stored.status).toBe('HOLDING');
      expect(stored.confirmedAt).toBeNull();
      expect(stored.holdExpiresAt.getTime() - stored.createdAt.getTime()).toBe(
        300000,
      );
      expect(stored.priceItems).toHaveLength(1);
      expect(stored.statusHistory).toHaveLength(1);
      expect(stored.occupancies[0].occupiedUntil.toISOString()).toBe(
        instant('09:15'),
      );
      expect(stored.totalAmount.toNumber()).toBe(100001);
      expect(stored.prepaymentPercent.toNumber()).toBe(30);
      expect(stored.requiredPrepaymentAmount.toNumber()).toBe(30000);
      expect((await availability()).status).toBe(200);
      expect(await (await availability()).json()).toMatchObject({
        data: { available: false },
      });
    });
    it('replays a 30 percent deposit and rejects 100 percent at HTTP validation', async () => {
      const payload = { ...input(), prepaymentPercent: 30 };
      const booking = await create(payload);
      const stored = await prisma.booking.findUniqueOrThrow({
        where: { id: booking.id },
      });
      expect(stored.prepaymentPercent.toNumber()).toBe(30);
      expect(stored.requiredPrepaymentAmount.toNumber()).toBe(30000);
      expect((await create(payload)).id).toBe(booking.id);
      const invalidDeposit = await http('bookings', 'POST', {
        ...payload,
        prepaymentPercent: 100,
      });
      expect(invalidDeposit.status).toBe(400);
      expect(await prisma.booking.count({ where: { courtId } })).toBe(1);
    });
    it.each([
      ['08:00', '09:00'],
      ['09:05', '10:05'],
    ])(
      'admits exactly one of simultaneous overlap/buffer requests %s–%s',
      async (start, end) => {
        const responses = await Promise.all([
          http('bookings', 'POST', input()),
          http('bookings', 'POST', input(start, end), tokenB),
        ]);
        expect(
          responses
            .map((response) => response.status)
            .sort((left, right) => left - right),
        ).toEqual([201, 409]);
        expect(await prisma.booking.count({ where: { courtId } })).toBe(1);
        expect(
          await prisma.bookingPriceItem.count({
            where: { booking: { courtId } },
          }),
        ).toBe(1);
        expect(
          await prisma.bookingStatusHistory.count({
            where: { booking: { courtId } },
          }),
        ).toBe(1);
      },
    );
    it('admits adjacent windows at exactly the half-open buffer boundary', async () => {
      const responses = await Promise.all([
        http('bookings', 'POST', input()),
        http('bookings', 'POST', input('09:15', '10:15'), tokenB),
      ]);
      expect(responses.map((response) => response.status)).toEqual([201, 201]);
    });
    it('rolls back booking and snapshots when a real DB trigger rejects the final occupancy insert', async () => {
      await prisma.$executeRawUnsafe(
        `CREATE FUNCTION public.booking_mvp_fail_occupancy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.court_id = '${courtId}'::uuid THEN RAISE EXCEPTION 'test occupancy failure'; END IF; RETURN NEW; END $$`,
      );
      await prisma.$executeRawUnsafe(
        'CREATE TRIGGER booking_mvp_fail_occupancy BEFORE INSERT ON court_occupancies FOR EACH ROW EXECUTE FUNCTION public.booking_mvp_fail_occupancy()',
      );
      try {
        expect((await http('bookings', 'POST', input())).status).toBe(503);
        expect(await prisma.booking.count({ where: { courtId } })).toBe(0);
        expect(
          await prisma.bookingPriceItem.count({
            where: { booking: { courtId } },
          }),
        ).toBe(0);
        expect(
          await prisma.bookingStatusHistory.count({
            where: { booking: { courtId } },
          }),
        ).toBe(0);
      } finally {
        await prisma.$executeRawUnsafe(
          'DROP TRIGGER booking_mvp_fail_occupancy ON court_occupancies',
        );
        await prisma.$executeRawUnsafe(
          'DROP FUNCTION public.booking_mvp_fail_occupancy()',
        );
      }
    });
    it('enforces authentication, CSRF and ownership; list never exposes another account', async () => {
      expect((await http('bookings', 'POST', input(), '')).status).toBe(401);
      expect(
        (await http('bookings', 'POST', input(), tokenA, false)).status,
      ).toBe(403);
      const booking = await create();
      expect(
        (
          await http(
            `bookings/${booking.id}/cancel`,
            'PATCH',
            undefined,
            tokenB,
          )
        ).status,
      ).toBe(404);
      expect(
        await (await http('bookings/me', 'GET', undefined, tokenB)).json(),
      ).toMatchObject({ data: [] });
      expect((await http('bookings/me', 'GET', undefined, '')).status).toBe(
        401,
      );
      expect(
        (await http('bookings/me')).headers.get('cache-control'),
      ).toContain('no-store');
    });
    it('cancels once, releases occupancy and allows rebooking without reviving the old key', async () => {
      const payload = input();
      const booking = await create(payload);
      expect(
        (await http(`bookings/${booking.id}/cancel`, 'PATCH')).status,
      ).toBe(200);
      expect(
        (await http(`bookings/${booking.id}/cancel`, 'PATCH')).status,
      ).toBe(200);
      expect((await create(payload)).status).toBe('CANCELLED');
      expect((await create()).id).not.toBe(booking.id);
      expect(
        await prisma.bookingStatusHistory.count({
          where: { bookingId: booking.id, toStatus: 'CANCELLED' },
        }),
      ).toBe(1);
    });
    async function ageHold(id: string) {
      const now = Date.now();
      await prisma.booking.update({
        where: { id },
        data: {
          createdAt: new Date(now - 600000),
          holdExpiresAt: new Date(now - 1),
        },
      });
    }
    it('refuses cancellation when a stored check-in already exists', async () => {
      const booking = await create();
      await prisma.bookingCheckin.create({
        data: {
          bookingId: booking.id,
          staffUserId: userB,
          method: 'MANUAL',
          note: 'Synthetic check-in fixture',
        },
      });
      expect(
        (await http(`bookings/${booking.id}/cancel`, 'PATCH')).status,
      ).toBe(409);
      expect(
        (await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } }))
          .status,
      ).toBe('HOLDING');
      expect(
        (
          await prisma.courtOccupancy.findUniqueOrThrow({
            where: { bookingId: booking.id },
          })
        ).state,
      ).toBe('ACTIVE');
    });
    it('quotes an expired hold as available without mutating stored state', async () => {
      const payload = input();
      const booking = await create(payload);
      await ageHold(booking.id);

      const response = await availability();
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        data: { available: true },
      });
      expect(
        (
          await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
          })
        ).status,
      ).toBe('HOLDING');
      expect(
        await prisma.bookingStatusHistory.count({
          where: { bookingId: booking.id, toStatus: 'EXPIRED' },
        }),
      ).toBe(0);
      expect(
        (
          await prisma.courtOccupancy.findUniqueOrThrow({
            where: { bookingId: booking.id },
          })
        ).state,
      ).toBe('ACTIVE');

      // The write path still reconciles before accepting a retry.
      expect((await create(payload)).status).toBe('EXPIRED');
      expect((await create()).status).toBe('HOLDING');
      expect(
        await prisma.bookingStatusHistory.count({
          where: { bookingId: booking.id, toStatus: 'EXPIRED' },
        }),
      ).toBe(1);
    });
    it('lets the BullMQ worker expire the hold once and release occupancy', async () => {
      const booking = await create();
      await ageHold(booking.id);

      const first = await expiryQueue.add(BOOKING_EXPIRY_JOB, {});
      await first.waitUntilFinished(queueEvents, 15_000);

      expect(
        (
          await prisma.booking.findUniqueOrThrow({
            where: { id: booking.id },
          })
        ).status,
      ).toBe('EXPIRED');
      expect(
        (
          await prisma.courtOccupancy.findUniqueOrThrow({
            where: { bookingId: booking.id },
          })
        ).state,
      ).toBe('RELEASED');
      expect(
        await prisma.bookingStatusHistory.count({
          where: { bookingId: booking.id, toStatus: 'EXPIRED' },
        }),
      ).toBe(1);

      const second = await expiryQueue.add(BOOKING_EXPIRY_JOB, {});
      await second.waitUntilFinished(queueEvents, 15_000);

      expect(
        await prisma.bookingStatusHistory.count({
          where: { bookingId: booking.id, toStatus: 'EXPIRED' },
        }),
      ).toBe(1);
      expect(await (await availability()).json()).toMatchObject({
        data: { available: true },
      });
    });
    it('expires at the write boundary even without a preceding availability read', async () => {
      const booking = await create();
      await ageHold(booking.id);
      expect((await create()).status).toBe('HOLDING');
      expect(
        (
          await prisma.courtOccupancy.findUniqueOrThrow({
            where: { bookingId: booking.id },
          })
        ).state,
      ).toBe('RELEASED');
    });
    it('deduplicates concurrent same-key requests, rejects payload mismatch and scopes keys by user', async () => {
      const payload = input();
      const [first, second] = await Promise.all([
        create(payload),
        create(payload),
      ]);
      expect(first.id).toBe(second.id);
      expect(
        (
          await http('bookings', 'POST', {
            ...payload,
            endsAt: instant('10:00'),
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await create(
            {
              ...payload,
              startsAt: instant('10:00'),
              endsAt: instant('11:00'),
            },
            tokenB,
          )
        ).id,
      ).not.toBe(first.id);
    });
    it('quotes split pricing, rejects missing prices and out-of-hours bookings without partial rows', async () => {
      const booking = await create(input('16:40', '18:10'));
      expect(booking.priceItems.map((item) => item.amount)).toEqual([
        33334, 186670,
      ]);
      expect(booking.totalAmount).toBe(220004);
      expect(
        (await http('bookings', 'POST', input('05:59', '06:30'))).status,
      ).toBe(400);
      await prisma.priceRule.updateMany({
        where: { courtId, priority: 1 },
        data: { isActive: false },
      });
      expect(
        (await http('bookings', 'POST', input('17:00', '18:00'))).status,
      ).toBe(400);
      expect(await prisma.booking.count({ where: { courtId } })).toBe(1);
    });
    it('rejects inactive courts/branches, malformed input and bookings starting too soon', async () => {
      expect(
        (await http('bookings', 'POST', { ...input(), totalAmount: 1 })).status,
      ).toBe(400);
      expect(
        (await http('bookings', 'POST', { ...input(), policyAccepted: false }))
          .status,
      ).toBe(400);
      expect(
        (
          await http('bookings', 'POST', {
            ...input(),
            startsAt: new Date(Date.now() + 60000).toISOString(),
          })
        ).status,
      ).toBe(400);
      await prisma.court.update({
        where: { id: courtId },
        data: { status: 'INACTIVE' },
      });
      expect((await http('bookings', 'POST', input())).status).toBe(404);
      expect((await http(`courts/${courtId}`)).status).toBe(404);
      await prisma.court.update({
        where: { id: courtId },
        data: { status: 'ACTIVE' },
      });
      await prisma.branch.update({
        where: { id: branchId },
        data: { isActive: false },
      });
      expect((await http(`courts/${courtId}`)).status).toBe(404);
    });
    it('returns authentic empty catalog and DB-derived prices, with expiry applied on my bookings', async () => {
      const response: unknown = await (await http(`courts/${courtId}`)).json();
      expect(response).toMatchObject({
        data: { id: courtId, pricePerHour: 100001 },
      });
      const booking = await create();
      await ageHold(booking.id);
      expect(await (await http('bookings/me')).json()).toMatchObject({
        data: [expect.objectContaining({ id: booking.id, status: 'EXPIRED' })],
      });
    });
  },
);

async function fixtures(prisma: PrismaService) {
  for (const id of [userA, userB])
    await prisma.user.create({
      data: {
        id,
        username: `booking-${id}`,
        email: `${id}@example.com`,
        phone: `test-${id.slice(0, 12)}`,
        passwordHash: 'unused',
        emailVerifiedAt: new Date(),
      },
    });
  await prisma.branch.create({
    data: {
      id: branchId,
      code: `test-${branchId.slice(0, 20)}`,
      name: 'Test',
      address: 'Test',
      phone: '123',
      businessHours: {
        create: Array.from({ length: 7 }, (_, index) => ({
          dayOfWeek: index + 1,
          openTime: timeOnly('06:00'),
          closeTime: timeOnly('23:00'),
        })),
      },
    },
  });
  await prisma.court.create({
    data: {
      id: courtId,
      branchId,
      code: 'TEST',
      name: 'Test court',
      priceRules: {
        create: [
          {
            startTime: timeOnly('06:00'),
            endTime: timeOnly('17:00'),
            pricePerHour: 100001,
            effectiveFrom: new Date('2020-01-01'),
          },
          {
            startTime: timeOnly('17:00'),
            endTime: timeOnly('23:00'),
            pricePerHour: 160003,
            effectiveFrom: new Date('2020-01-01'),
            priority: 1,
          },
        ],
      },
    },
  });
}
async function clearBookings(prisma: PrismaService) {
  await prisma.bookingCheckin.deleteMany({ where: { booking: { courtId } } });
  await prisma.courtOccupancy.deleteMany({ where: { courtId } });
  await prisma.bookingStatusHistory.deleteMany({
    where: { booking: { courtId } },
  });
  await prisma.bookingPriceItem.deleteMany({ where: { booking: { courtId } } });
  await prisma.booking.deleteMany({ where: { courtId } });
}
