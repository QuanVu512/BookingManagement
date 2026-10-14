import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import pg from 'pg';
import { auditPhones } from '../scripts/phone-audit.mjs';

const TEST_URL = process.env.AUTH_MIGRATION_TEST_URL;
const MIGRATION = readFileSync(
  new URL(
    '../prisma/migrations/20261013090000_normalize_auth_phone/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const USER_IDS = [
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
];

await test('audit detects collisions and invalid numbers without revealing phone values', () => {
  const report = auditPhones([
    { id: USER_IDS[0], phone: '0912345678' },
    { id: USER_IDS[1], phone: '+84912345678' },
    { id: 'invalid-user', phone: '0123456789' },
  ]);
  assert.deepEqual(report, {
    total: 3,
    changedCount: 1,
    invalidIds: ['invalid-user'],
    collisions: [USER_IDS],
  });
});

await test(
  'PostgreSQL auth phone migration',
  { skip: !TEST_URL },
  async (suite) => {
    const target = new URL(TEST_URL);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.pathname, '/auth_validation_test');
    const client = new pg.Client({ connectionString: TEST_URL });
    await client.connect();
    try {
      await client.query('DROP TABLE IF EXISTS public.users');
      await client.query(
        'CREATE TABLE public.users (id uuid PRIMARY KEY, phone varchar(20) UNIQUE NOT NULL)',
      );
      await runDatabaseCases(suite, client);
    } finally {
      await client.end();
    }
  },
);

async function runDatabaseCases(suite, client) {
  await suite.test(
    'normalizes domestic phones, preserves canonical numbers, and is idempotent',
    async () => {
      await seedPhones(client, [' 0912345678 ', '+84987654321']);
      await client.query(MIGRATION);
      assert.deepEqual(await phones(client), ['+84912345678', '+84987654321']);
      await client.query(MIGRATION);
      assert.deepEqual(await phones(client), ['+84912345678', '+84987654321']);
    },
  );
  await suite.test(
    'fails on collision before writing and leaves every row unchanged',
    async () => {
      const original = ['0912345678', '+84912345678'];
      await seedPhones(client, original);
      await assert.rejects(
        client.query(MIGRATION),
        /Phone normalization collision/,
      );
      await client.query('ROLLBACK');
      assert.deepEqual(await phones(client), original);
    },
  );
  await suite.test(
    'rejects invalid metadata numbers before changing any valid row',
    async () => {
      const original = ['0912345678', '0123456789'];
      await seedPhones(client, original);
      await assert.rejects(client.query(MIGRATION), /Invalid Vietnamese phone/);
      await client.query('ROLLBACK');
      assert.deepEqual(await phones(client), original);
    },
  );
  await suite.test(
    'recognizes fixed lines as well as mobile numbers',
    async () => {
      await seedPhones(client, ['02431234567', '0321234567']);
      await client.query(MIGRATION);
      assert.deepEqual(await phones(client), ['+842431234567', '+84321234567']);
    },
  );
  await suite.test(
    'CLI reads the test DB without writing and returns failure on collision',
    async () => {
      const original = ['0912345678', '+84912345678'];
      await seedPhones(client, original);
      assert.throws(
        () =>
          execFileSync(
            process.execPath,
            ['backend/scripts/audit-auth-phones.mjs'],
            {
              env: { ...process.env, DATABASE_URL: TEST_URL },
              stdio: 'pipe',
            },
          ),
        (error) => {
          assert.equal(error.status, 1);
          assert.deepEqual(JSON.parse(error.stdout.toString()).collisions, [
            USER_IDS,
          ]);
          return true;
        },
      );
      assert.deepEqual(await phones(client), original);
    },
  );
}

async function seedPhones(client, values) {
  await client.query('TRUNCATE public.users');
  for (const [index, phone] of values.entries()) {
    await client.query('INSERT INTO public.users (id, phone) VALUES ($1, $2)', [
      USER_IDS[index],
      phone,
    ]);
  }
}
async function phones(client) {
  const result = await client.query(
    'SELECT phone FROM public.users ORDER BY id',
  );
  return result.rows.map((row) => row.phone);
}
