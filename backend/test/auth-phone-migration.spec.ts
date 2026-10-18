import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { execFileSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { normalizeVietnamPhone } from '../src/modules/auth/helpers/auth-normalization.js';

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
const NORMALIZE_FUNCTION = MIGRATION.match(
  /CREATE FUNCTION pg_temp\.normalize_auth_phone[\s\S]*?\$\$;/,
)?.[0];
// The same corpus is used by the TypeScript helper, the audit CLI and this
// PostgreSQL parity check. Only string inputs can be passed to the SQL function.
const PHONE_CORPUS: [string, string | null][] = (
  JSON.parse(
    readFileSync(
      new URL('./fixtures/test-phone-corpus.json', import.meta.url),
      'utf8',
    ),
  ) as { cases: { input: unknown; expected: string | null }[] }
).cases
  .filter(
    (entry): entry is { input: string; expected: string | null } =>
      typeof entry.input === 'string',
  )
  .map((entry) => [entry.input, entry.expected]);

if (process.env.AUTH_MIGRATION_REQUIRE_STORAGE === 'true' && !TEST_URL) {
  throw new Error(
    'AUTH_MIGRATION_TEST_URL is required for mandatory phone migration checks.',
  );
}
const databaseDescribe = TEST_URL ? describe : describe.skip;
databaseDescribe('PostgreSQL auth phone migration on isolated audit DB', () => {
  let client: pg.Client;
  beforeAll(async () => {
    const target = new URL(TEST_URL ?? '');
    expect(target.hostname).toBe('127.0.0.1');
    expect(target.pathname).toBe('/auth_validation_test');
    client = new pg.Client({
      connectionString: TEST_URL,
      connectionTimeoutMillis: 5000,
    });
    await client.connect();
    await client.query('DROP TABLE IF EXISTS public.users');
    await client.query(
      'CREATE TABLE public.users (id uuid PRIMARY KEY, phone varchar(20) UNIQUE NOT NULL)',
    );
  });
  afterAll(async () => {
    await client?.end();
  });

  test('normalizes domestic phones, preserves canonical numbers, and is idempotent', async () => {
    await seedPhones(client, [' 0912345678 ', '+84987654321']);
    await client.query(MIGRATION);
    expect(await phones(client)).toEqual(['+84912345678', '+84987654321']);
    await client.query(MIGRATION);
    expect(await phones(client)).toEqual(['+84912345678', '+84987654321']);
  });
  test.each([
    {
      original: ['0912345678', '+84912345678'],
      error: /Phone normalization collision/,
    },
    {
      original: ['0912345678', '0123456789'],
      error: /Invalid Vietnamese phone/,
    },
  ])('rolls back unchanged rows for $error', async ({ original, error }) => {
    await seedPhones(client, original);
    await expect(client.query(MIGRATION)).rejects.toThrow(error);
    await client.query('ROLLBACK');
    expect(await phones(client)).toEqual(original);
  });
  test('recognizes fixed lines as well as mobile numbers', async () => {
    await seedPhones(client, ['02431234567', '0321234567']);
    await client.query(MIGRATION);
    expect(await phones(client)).toEqual(['+842431234567', '+84321234567']);
  });
  test('matches the TypeScript normalizer for the shared phone corpus', async () => {
    if (!NORMALIZE_FUNCTION)
      throw new Error('Normalization function missing from migration.');
    await client.query(NORMALIZE_FUNCTION);
    try {
      for (const [input, expected] of PHONE_CORPUS) {
        const result = await client.query<{ normalized: string | null }>(
          'SELECT pg_temp.normalize_auth_phone($1) AS normalized',
          [input],
        );
        expect(result.rows[0].normalized).toBe(expected);
        expect(normalizeVietnamPhone(input)).toBe(expected);
      }
    } finally {
      await client.query(
        'DROP FUNCTION IF EXISTS pg_temp.normalize_auth_phone(text)',
      );
    }
  });
  test('CLI is read-only and reports collisions without phone values', async () => {
    const original = ['0912345678', '+84912345678'];
    await seedPhones(client, original);
    let failure: unknown;
    try {
      runAudit();
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ status: 1 });
    if (!isProcessFailure(failure))
      throw new Error('Expected failed audit CLI');
    const output = failure.stdout.toString();
    expect(JSON.parse(output).collisions).toEqual([USER_IDS]);
    for (const phone of original) expect(output).not.toContain(phone);
    expect(await phones(client)).toEqual(original);
  });
  test('CLI succeeds on canonical values without writing', async () => {
    const original = ['+84912345678', '+84987654321'];
    await seedPhones(client, original);
    expect(JSON.parse(runAudit())).toEqual({
      total: 2,
      changedCount: 0,
      invalidIds: [],
      collisions: [],
    });
    expect(await phones(client)).toEqual(original);
  });
});

function runAudit() {
  return execFileSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../prisma/audit-auth-phones.mjs', import.meta.url),
      ),
    ],
    {
      env: { ...process.env, DATABASE_URL: TEST_URL },
      encoding: 'utf8',
      stdio: 'pipe',
    },
  );
}
function isProcessFailure(error: unknown): error is SpawnSyncReturns<string> {
  return (
    typeof error === 'object' &&
    error !== null &&
    'stdout' in error &&
    typeof error.stdout === 'string'
  );
}
async function seedPhones(client: pg.Client, values: string[]) {
  await client.query('TRUNCATE public.users');
  for (const [index, phone] of values.entries()) {
    await client.query('INSERT INTO public.users (id, phone) VALUES ($1, $2)', [
      USER_IDS[index],
      phone,
    ]);
  }
}
async function phones(client: pg.Client) {
  const result = await client.query<{ phone: string }>(
    'SELECT phone FROM public.users ORDER BY id',
  );
  return result.rows.map((row) => row.phone);
}
