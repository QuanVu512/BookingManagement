import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { PrismaGuestCheckoutStore } from '../src/modules/payments/infrastructure/prisma-guest-checkout-store.js';

/**
 * Regression cho P1 UTC-01 (review độc lập 2026-11-01):
 * `options` nằm trong DATABASE_URL từng ghi đè trường `options` mà adapter
 * truyền riêng, đưa session về timezone mặc định của DB. Spec này dùng
 * PrismaService + store thật, không mock, và chứng minh:
 * - session luôn UTC với URL không options, options khác, timezone non-UTC;
 * - epoch ghi vào TIMESTAMPTZ khớp epoch app định ghi;
 * - proof còn 5 phút thỏa điều kiện SQL expiry và consume được một lần;
 * - các options khác (statement_timeout) vẫn còn hiệu lực.
 *
 * Chỉ chạy khi GUEST_RECOVERY_DATABASE_TEST_URL trỏ DB disposable
 * `guest_recovery_test`. DB này phải có timezone mặc định non-UTC để phép thử
 * có ý nghĩa; helper set-test-db-tz đặt `Asia/Bangkok`.
 */
const databaseUrl = process.env.GUEST_RECOVERY_DATABASE_TEST_URL;
const TARGET_DATABASE = 'guest_recovery_test';

function assertIsolatedDatabase(value: string): void {
  const target = new URL(value);
  if (!['postgresql:', 'postgres:'].includes(target.protocol)) {
    throw new Error('Chỉ chấp nhận PostgreSQL loopback cho test này.');
  }
  if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
    throw new Error('Chỉ chấp nhận host loopback cho test này.');
  }
  if (target.pathname !== `/${TARGET_DATABASE}`) {
    throw new Error(`Chỉ chấp nhận database ${TARGET_DATABASE}.`);
  }
}

const storageDescribe = databaseUrl ? describe : describe.skip;

storageDescribe('Prisma session UTC bất biến với options trong DATABASE_URL', () => {
  jest.setTimeout(60_000);

  const prismaClients: PrismaService[] = [];
  let databaseTimezone = '';

  beforeAll(async () => {
    if (!databaseUrl) return;
    assertIsolatedDatabase(databaseUrl);
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const result = await client.query<{ tz: string }>(
        `SELECT current_setting('TimeZone') AS tz`,
      );
      databaseTimezone = result.rows[0].tz;
    } finally {
      await client.end();
    }
    // Nếu DB mặc định đã UTC thì bug precedence không thể lộ ra và spec này
    // sẽ PASS giả. Báo rõ để người chạy đặt timezone non-UTC trước.
    expect(databaseTimezone.toUpperCase()).not.toBe('UTC');
  });

  afterAll(async () => {
    for (const prisma of prismaClients) {
      await prisma.$disconnect();
    }
  });

  const scenarios: Array<{
    name: string;
    options: string | null;
    expectsStatementTimeout?: boolean;
  }> = [
    { name: 'URL không có options', options: null },
    {
      name: 'URL options statement_timeout',
      options: '-c statement_timeout=5000',
      expectsStatementTimeout: true,
    },
    {
      name: 'URL options timezone non-UTC',
      options: '-c timezone=Asia/Bangkok',
    },
    {
      name: 'URL options timezone non-UTC + statement_timeout',
      options: '-c statement_timeout=5000 -c timezone=Asia/Bangkok',
      expectsStatementTimeout: true,
    },
    {
      name: 'URL options timezone non-UTC có quote',
      options: "-c timezone='Asia/Bangkok'",
    },
  ];

  for (const scenario of scenarios) {
    it(`${scenario.name}: session UTC, epoch khớp, proof consume được`, async () => {
      if (!databaseUrl) return;

      const url = new URL(databaseUrl);
      if (scenario.options !== null) {
        url.searchParams.set('options', scenario.options);
      }
      const prisma = new PrismaService(
        new ConfigService({ DATABASE_URL: url.href }),
      );
      prismaClients.push(prisma);
      await prisma.$connect();

      const [session] = await prisma.$queryRaw<{ tz: string }[]>`
        SELECT current_setting('TimeZone') AS tz`;
      expect(session.tz).toBe('UTC');

      if (scenario.expectsStatementTimeout) {
        const [timeout] = await prisma.$queryRaw<
          { statement_timeout: string }[]
        >`SHOW statement_timeout`;
        expect(timeout.statement_timeout).toBe('5s');
      }

      const intended = new Date(Date.now() + 5 * 60_000);
      const email = `utc-${randomUUID()}@example.test`;
      const proof = await prisma.guestOtpProof.create({
        data: {
          email,
          purpose: 'GUEST_HOLD_CREATE',
          tokenHash: randomBytes(32).toString('hex'),
          expiresAt: intended,
        },
      });

      const [stored] = await prisma.$queryRaw<
        { epoch_ms: number; live: boolean }[]
      >`
        SELECT (extract(epoch FROM expires_at) * 1000)::float8 AS epoch_ms,
               expires_at > clock_timestamp() AS live
        FROM guest_otp_proofs
        WHERE id = ${proof.id}::uuid`;

      expect(stored.epoch_ms).toBe(intended.getTime());
      expect(stored.live).toBe(true);

      const store = new PrismaGuestCheckoutStore(prisma);
      const consumed = await store.withTransaction((transaction, current) =>
        current.consumeProof(transaction, {
          proofId: proof.id,
          email,
          purpose: 'GUEST_HOLD_CREATE',
        }),
      );
      expect(consumed).not.toBeNull();
    });
  }
});
