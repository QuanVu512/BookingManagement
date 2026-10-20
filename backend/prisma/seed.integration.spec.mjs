/**
 * RF-01A/B integration gates (T01–T05b, T07).
 * Requires an explicitly approved disposable PostgreSQL target:
 *   SEED_TEST_DATABASE_URL=postgresql://...@localhost:PORT/dbname
 *   SEED_TEST_ALLOWED_DATABASE=dbname
 *   SEED_TEST_ALLOWED_HOST=localhost
 * The suite skips (BLOCKED) when the target is not provided; it never falls
 * back to the application DATABASE_URL.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import argon from 'argon2';

const execFileAsync = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const databaseUrl = process.env.SEED_TEST_DATABASE_URL ?? '';
const allowedDatabase = process.env.SEED_TEST_ALLOWED_DATABASE ?? '';
const allowedHost = process.env.SEED_TEST_ALLOWED_HOST ?? 'localhost';

function targetIsSafe() {
  if (!databaseUrl || !allowedDatabase) return false;
  try {
    const parsed = new URL(databaseUrl);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(
      parsed.hostname,
    );
    return (
      parsed.protocol === 'postgresql:' &&
      parsed.hostname === allowedHost &&
      loopback &&
      decodeURIComponent(parsed.pathname.replace(/^\//, '')) ===
        allowedDatabase
    );
  } catch {
    return false;
  }
}

const safe = targetIsSafe();
if (!safe) {
  // Required exit is BLOCKED, not PASS: no approved disposable target.
  console.warn(
    '[seed.integration] BLOCKED — set SEED_TEST_DATABASE_URL + SEED_TEST_ALLOWED_DATABASE to an approved disposable loopback PostgreSQL.',
  );
}

const describeIfSafe = safe ? describe : describe.skip;

const seedEnv = {
  ...process.env,
  NODE_ENV: 'test',
  SEED_ENABLED: 'true',
  DATABASE_URL: databaseUrl,
  SEED_ALLOWED_HOST: allowedHost,
  SEED_ALLOWED_DATABASE: allowedDatabase,
  SEED_ADMIN_USERNAME: 'seedadmin',
  SEED_ADMIN_EMAIL: 'seed-admin@example.com',
  SEED_ADMIN_PHONE: '0901234567',
  SEED_ADMIN_FULL_NAME: 'Seed Admin',
  SEED_ADMIN_PASSWORD: 'seed-admin-password',
};

async function runSeed(mode) {
  return execFileAsync(
    process.execPath,
    ['backend/prisma/seed.mjs', `--mode=${mode}`],
    { cwd: root, env: seedEnv, timeout: 30_000 },
  );
}

async function withClient(action) {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

describeIfSafe('seed integration (RF-01)', () => {
  beforeAll(async () => {
    await withClient(async (client) => {
      await client.query(
        'DELETE FROM price_rules WHERE court_id IN (SELECT id FROM courts WHERE branch_id = $1)',
        ['10000000-0000-4000-8000-000000000001'],
      );
      await client.query(
        'DELETE FROM courts WHERE branch_id = $1',
        ['10000000-0000-4000-8000-000000000001'],
      );
      await client.query(
        'DELETE FROM branch_business_hours WHERE branch_id = $1',
        ['10000000-0000-4000-8000-000000000001'],
      );
      await client.query('DELETE FROM branches WHERE id = $1', [
        '10000000-0000-4000-8000-000000000001',
      ]);
    });
  });

  it('seeds the catalog and is idempotent across two runs', async () => {
    await runSeed('courts');
    await runSeed('courts');
    const counts = await withClient(async (client) => {
      const branch = await client.query(
        'SELECT COUNT(*)::int AS count FROM branches WHERE id = $1',
        ['10000000-0000-4000-8000-000000000001'],
      );
      const courts = await client.query(
        'SELECT COUNT(*)::int AS count FROM courts WHERE branch_id = $1',
        ['10000000-0000-4000-8000-000000000001'],
      );
      const hours = await client.query(
        'SELECT COUNT(*)::int AS count FROM branch_business_hours WHERE branch_id = $1',
        ['10000000-0000-4000-8000-000000000001'],
      );
      const prices = await client.query(
        `SELECT COUNT(*)::int AS count FROM price_rules
         WHERE court_id IN (SELECT id FROM courts WHERE branch_id = $1)`,
        ['10000000-0000-4000-8000-000000000001'],
      );
      return {
        branch: branch.rows[0].count,
        courts: courts.rows[0].count,
        hours: hours.rows[0].count,
        prices: prices.rows[0].count,
      };
    });
    expect(counts).toEqual({ branch: 1, courts: 4, hours: 7, prices: 4 });
  });

  it('restores deleted owned baseline rows but keeps custom edits', async () => {
    await withClient(async (client) => {
      await client.query('DELETE FROM price_rules WHERE id = $1', [
        '10000000-0000-4000-8000-000000000204',
      ]);
      await client.query('DELETE FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000104',
      ]);
      await client.query('UPDATE courts SET name = $2 WHERE id = $1', [
        '10000000-0000-4000-8000-000000000103',
        'Custom Standard 3',
      ]);
      await client.query(
        `INSERT INTO courts (id, branch_id, code, name, court_type, cleanup_minutes)
         VALUES ('10000000-0000-4000-8000-000000000777', $1, 'CUSTOM-77', 'Custom', 'STANDARD', 15)`,
        ['10000000-0000-4000-8000-000000000001'],
      );
    });
    await runSeed('courts');
    await withClient(async (client) => {
      const restored = await client.query(
        'SELECT name FROM courts WHERE id = $1',
        ['10000000-0000-4000-8000-000000000104'],
      );
      expect(restored.rowCount).toBe(1);
      const edited = await client.query('SELECT name FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000103',
      ]);
      expect(edited.rows[0].name).toBe('Custom Standard 3');
      const custom = await client.query('SELECT name FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000777',
      ]);
      expect(custom.rowCount).toBe(1);
      await client.query('DELETE FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000777',
      ]);
    });
  });

  it('fails cleanly with zero writes when an unmanaged UUID holds PRO-01', async () => {
    await withClient(async (client) => {
      await client.query('DELETE FROM price_rules WHERE court_id = $1', [
        '10000000-0000-4000-8000-000000000101',
      ]);
      await client.query('DELETE FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000101',
      ]);
      await client.query(
        `INSERT INTO courts (id, branch_id, code, name, court_type, cleanup_minutes)
         VALUES ('10000000-0000-4000-8000-000000000888', $1, 'PRO-01', 'Unmanaged', 'VIP', 15)`,
        ['10000000-0000-4000-8000-000000000001'],
      );
    });
    await expect(runSeed('courts')).rejects.toMatchObject({
      code: 1,
    });
    const after = await withClient(async (client) => {
      const unmanaged = await client.query('SELECT name FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000888',
      ]);
      const baseline = await client.query('SELECT id FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000101',
      ]);
      return {
        unmanagedName: unmanaged.rows[0]?.name,
        baselineRestored: baseline.rowCount,
      };
    });
    expect(after).toEqual({ unmanagedName: 'Unmanaged', baselineRestored: 0 });
    await withClient(async (client) => {
      await client.query('DELETE FROM courts WHERE id = $1', [
        '10000000-0000-4000-8000-000000000888',
      ]);
    });
    await runSeed('courts');
  });

  it('bootstraps exactly one verified Admin and never rotates it', async () => {
    await runSeed('all');
    const first = await withClient(async (client) => {
      const user = await client.query(
        'SELECT password_hash, email_verified_at FROM users WHERE id = $1',
        ['10000000-0000-4000-8000-000000000901'],
      );
      const roles = await client.query(
        "SELECT role FROM user_roles WHERE user_id = $1 AND role = 'ADMIN'",
        ['10000000-0000-4000-8000-000000000901'],
      );
      return { hash: user.rows[0].password_hash, verified: user.rows[0].email_verified_at, roles: roles.rowCount };
    });
    expect(first.roles).toBe(1);
    expect(first.verified).not.toBeNull();
    await expect(
      argon.verify(first.hash, 'seed-admin-password'),
    ).resolves.toBe(true);
    await runSeed('all');
    const second = await withClient((client) =>
      client.query('SELECT password_hash FROM users WHERE id = $1', [
        '10000000-0000-4000-8000-000000000901',
      ]),
    );
    expect(second.rows[0].password_hash).toBe(first.hash);
  });

  afterAll(async () => {
    await withClient(async (client) => {
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [
        '10000000-0000-4000-8000-000000000901',
      ]);
      await client.query('DELETE FROM user_profiles WHERE user_id = $1', [
        '10000000-0000-4000-8000-000000000901',
      ]);
      await client.query('DELETE FROM users WHERE id = $1', [
        '10000000-0000-4000-8000-000000000901',
      ]);
      await client.query(
        'DELETE FROM price_rules WHERE court_id IN (SELECT id FROM courts WHERE branch_id = $1)',
        ['10000000-0000-4000-8000-000000000001'],
      );
      await client.query('DELETE FROM courts WHERE branch_id = $1', [
        '10000000-0000-4000-8000-000000000001',
      ]);
      await client.query(
        'DELETE FROM branch_business_hours WHERE branch_id = $1',
        ['10000000-0000-4000-8000-000000000001'],
      );
      await client.query('DELETE FROM branches WHERE id = $1', [
        '10000000-0000-4000-8000-000000000001',
      ]);
    });
  });
});
