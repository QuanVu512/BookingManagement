import { readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { PrismaService } from '../../src/infrastructure/prisma/prisma.service.js';

export const DEPOSIT_MIGRATION = '20261026000000_guest_deposit_policy';
const MIGRATIONS = new URL('../../prisma/migrations/', import.meta.url);
const TEST_DATABASE = '/booking_deposit_test';

export async function openDepositDatabase(value: string): Promise<pg.Client> {
  const target = new URL(value);
  if (
    !['postgresql:', 'postgres:'].includes(target.protocol) ||
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.pathname !== TEST_DATABASE
  ) {
    throw new Error(
      'Only an explicit loopback booking_deposit_test is allowed.',
    );
  }
  const client = new pg.Client({
    connectionString: value,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const result = await client.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    if (result.rows[0].count !== 0)
      throw new Error(
        'Deposit integration requires a NEW empty disposable database.',
      );
    return client;
  } catch (error) {
    await client.end();
    throw error;
  }
}

export async function applyHistoricalMigrations(
  client: pg.Client,
): Promise<void> {
  const entries = readdirSync(MIGRATIONS, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name >= DEPOSIT_MIGRATION) continue;
    await client.query(
      readFileSync(new URL(`${entry.name}/migration.sql`, MIGRATIONS), 'utf8'),
    );
  }
}

export async function applyDepositMigration(client: pg.Client): Promise<void> {
  await client.query(
    readFileSync(
      new URL(`${DEPOSIT_MIGRATION}/migration.sql`, MIGRATIONS),
      'utf8',
    ),
  );
}

/**
 * Bước 2: sau deposit migration, tiếp tục áp các migration mới hơn trên cùng
 * DB disposable để bảng guest checkout (proof/intent/challenge) tồn tại.
 */
export async function applyRemainingMigrations(
  client: pg.Client,
): Promise<void> {
  const entries = readdirSync(MIGRATIONS, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name <= DEPOSIT_MIGRATION) continue;
    await client.query(
      readFileSync(new URL(`${entry.name}/migration.sql`, MIGRATIONS), 'utf8'),
    );
  }
}

export async function depositFixtures(prisma: PrismaService) {
  // users.phone là unique; fixture chạy nhiều lần trên cùng DB disposable nên
  // không dùng số cố định.
  const phoneDigits = randomUUID()
    .replace(/[^0-9]/gu, '')
    .padEnd(9, '0')
    .slice(0, 9);
  const user = await prisma.user.create({
    data: {
      username: `deposit-${randomUUID()}`,
      email: `${randomUUID()}@example.test`,
      phone: `+84${phoneDigits}`,
      passwordHash: 'unused-test-fixture',
    },
  });
  const branch = await prisma.branch.create({
    data: {
      code: `deposit-${randomUUID().slice(0, 12)}`,
      name: 'Deposit test',
      address: 'Synthetic',
      phone: '123',
      businessHours: {
        create: Array.from({ length: 7 }, (_, index) => ({
          dayOfWeek: index + 1,
          openTime: new Date('1970-01-01T06:00:00Z'),
          closeTime: new Date('1970-01-01T23:00:00Z'),
        })),
      },
    },
  });
  const court = await prisma.court.create({
    data: {
      branchId: branch.id,
      code: 'DEPOSIT',
      name: 'Deposit test court',
      priceRules: {
        create: {
          startTime: new Date('1970-01-01T06:00:00Z'),
          endTime: new Date('1970-01-01T23:00:00Z'),
          pricePerHour: 100005,
          effectiveFrom: new Date('2020-01-01T00:00:00Z'),
        },
      },
    },
  });
  return { userId: user.id, branchId: branch.id, courtId: court.id };
}

interface SnapshotInput {
  userId: string | null;
  branchId: string;
  courtId: string;
  percent: number;
  total?: number;
  required: number;
}

export async function insertSnapshot(
  client: pg.Client,
  input: SnapshotInput,
): Promise<string> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO bookings (
    id, booking_code, user_id, branch_id, court_id, source,
    customer_name, customer_email, customer_phone, starts_at, ends_at,
    total_amount, prepayment_percent, required_prepayment_amount, hold_expires_at,
    cancellation_rule, cancellation_deadline_at, policy_version, policy_accepted_at, idempotency_key
  ) VALUES ($1, $2, $3, $4, $5, 'CUSTOMER_WEB',
    'Synthetic deposit fixture', 'deposit@example.test', '+84912345678',
    '2035-01-08T01:00:00Z', '2035-01-08T02:00:00Z', $6, $7, $8,
    clock_timestamp() + interval '5 minutes', 'BEFORE_START', '2035-01-08T01:00:00Z',
    'legacy-policy-v1', clock_timestamp(), $9)`,
    [
      id,
      `BK-${id.slice(0, 24)}`,
      input.userId,
      input.branchId,
      input.courtId,
      input.total ?? 100005,
      input.percent,
      input.required,
      randomUUID(),
    ],
  );
  return id;
}
