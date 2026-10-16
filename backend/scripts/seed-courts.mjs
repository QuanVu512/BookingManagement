import pg from 'pg';

// This opt-in seed owns only the MVP-DEMO branch and these stable UUIDs.
const BRANCH_ID = '10000000-0000-4000-8000-000000000001';
const COURTS = [
  [
    '10000000-0000-4000-8000-000000000101',
    'PRO-01',
    'Center Court Pro 1',
    'VIP',
    280000,
  ],
  [
    '10000000-0000-4000-8000-000000000102',
    'PRO-02',
    'Championship Arena 2',
    'VIP',
    240000,
  ],
  [
    '10000000-0000-4000-8000-000000000103',
    'STD-03',
    'Pickle Standard 3',
    'STANDARD',
    170000,
  ],
  [
    '10000000-0000-4000-8000-000000000104',
    'STD-04',
    'Dynamic Court 4',
    'STANDARD',
    160000,
  ],
];
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
if (!process.env.DATABASE_URL)
  throw new Error('Cần DATABASE_URL tường minh cho seed.');
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query(
    `INSERT INTO branches (id, code, name, address, phone, timezone)
    VALUES ($1, 'MVP-DEMO', 'SMASH ARENA — Chi nhánh demo', 'Phù Đổng, Hà Nội', '02400000000', 'Asia/Ho_Chi_Minh')
    ON CONFLICT (id) DO NOTHING`,
    [BRANCH_ID],
  );
  for (let weekday = 1; weekday <= 7; weekday++) {
    await client.query(
      `INSERT INTO branch_business_hours (branch_id, day_of_week, open_time, close_time)
      VALUES ($1, $2, '06:00', '23:00') ON CONFLICT (branch_id, day_of_week) DO NOTHING`,
      [BRANCH_ID, weekday],
    );
  }
  for (const [id, code, name, type, rate] of COURTS) {
    await client.query(
      `INSERT INTO courts (id, branch_id, code, name, court_type, cleanup_minutes)
      VALUES ($1, $2, $3, $4, $5, 15) ON CONFLICT (id) DO NOTHING`,
      [id, BRANCH_ID, code, name, type],
    );
    // IDs are distinct from court UUIDs and stable across runs.
    await client.query(
      `INSERT INTO price_rules (id, court_id, start_time, end_time, price_per_hour, effective_from)
      VALUES ($1, $2, '06:00', '23:00', $3, '2020-01-01') ON CONFLICT (id) DO NOTHING`,
      [id.replace('-0000000001', '-0000000002'), id, rate],
    );
  }
  await client.query('COMMIT');
  console.log(
    'Seed MVP-DEMO: 4 sân, giờ hoạt động và giá đã sẵn sàng; dữ liệu hiện có được giữ lại.',
  );
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(
    'Seed thất bại; transaction đã được rollback.',
    error instanceof Error ? error.name : 'DatabaseError',
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
