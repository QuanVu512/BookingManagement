import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Mirrors backend/src/modules/auth/helpers/auth-normalization.ts and the
// PostgreSQL function in 20261013090000_normalize_auth_phone/migration.sql.
const VIETNAM_PHONE_INPUT_PATTERN = /^(?:0|\+84)[0-9]+$/;
const VIETNAM_NATIONAL_PHONE_PATTERN =
  /^(?:2(?:0[3-9]|1[0-689]|2[0-25-9]|[38][2-9]|4[2-8]|5[124-9]|6[0-39]|7[0-7]|9[0-4679])[0-9]{7}|121[0-3][0-9]{5}|(?:1[46]0|(?:3[0-9]|7[06-9])[0-9]|5(?:[1689][0-9]|2[238]|59)|8(?:[1-8][0-9]|9[6-9])|9(?:[0-8][0-9]|9[013-9]))[0-9]{6}|1800[0-9]{4,6}|12(?:0[13]|28)[0-9]{4}|1900[0-9]{4,6}|[17]99[0-9]{4}|69[0-9]{5,6}|672[0-9]{6})$/;

export function normalizeVietnamPhonePure(value) {
  if (typeof value !== 'string') return null;
  const input = value.trim();
  if (!VIETNAM_PHONE_INPUT_PATTERN.test(input)) return null;
  const national = input.startsWith('+84') ? input.slice(3) : input.slice(1);
  return VIETNAM_NATIONAL_PHONE_PATTERN.test(national)
    ? `+84${national}`
    : null;
}

export function auditPhones(users) {
  const invalidIds = [];
  const usersByPhone = new Map();
  let changedCount = 0;
  for (const user of users) {
    const normalized = normalizeVietnamPhonePure(user.phone);
    if (!normalized) {
      invalidIds.push(user.id);
      continue;
    }
    if (normalized !== user.phone) changedCount += 1;
    const ids = usersByPhone.get(normalized) ?? [];
    ids.push(user.id);
    usersByPhone.set(normalized, ids);
  }
  const collisions = [...usersByPhone.values()].filter((ids) => ids.length > 1);
  return { total: users.length, changedCount, invalidIds, collisions };
}

async function readAudit(client) {
  await client.query('BEGIN READ ONLY');
  const { rows } = await client.query(
    'SELECT id, phone FROM public.users ORDER BY id',
  );
  const audit = auditPhones(rows);
  await client.query('COMMIT');
  console.log(JSON.stringify(audit, null, 2));
  process.exitCode = audit.invalidIds.length || audit.collisions.length ? 1 : 0;
}

async function runAudit() {
  if (!process.env.DATABASE_URL) {
    console.error(
      'DATABASE_URL chưa được cấu hình; truyền URL DB cần tiền kiểm qua môi trường.',
    );
    process.exitCode = 1;
    return;
  }
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await readAudit(client);
  } catch {
    console.error(
      'Tiền kiểm thất bại; không thay đổi dữ liệu. Kiểm tra kết nối và cấu trúc users của DB đích.',
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await runAudit();
}
