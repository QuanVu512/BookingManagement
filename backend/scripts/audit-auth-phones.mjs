import pg from 'pg';
import { auditPhones } from './phone-audit.mjs';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL chưa được cấu hình cho DB cần tiền kiểm.');
  process.exitCode = 1;
} else {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const { rows } = await client.query(
      'SELECT id, phone FROM public.users ORDER BY id',
    );
    const audit = auditPhones(rows);
    console.log(JSON.stringify(audit, null, 2));
    process.exitCode =
      audit.invalidIds.length || audit.collisions.length ? 1 : 0;
    await client.query('COMMIT');
  } catch {
    console.error(
      'Tiền kiểm thất bại; không thay đổi dữ liệu. Kiểm tra kết nối và cấu trúc users của DB đích.',
    );
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
