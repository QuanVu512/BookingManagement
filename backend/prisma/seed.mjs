/**
 * RF-01A/RF-01B — Prisma seed engine.
 * Create-only seed for the MVP-DEMO catalog and the development Admin
 * bootstrap. Never updates existing rows, never deletes, never creates
 * booking/payment/invoice fixtures, and never runs outside dev/test.
 */
import pg from 'pg';
import argon from 'argon2';
import {
  SEED_ADMIN_USER_ID,
  SEED_BRANCH,
  SEED_BUSINESS_HOURS,
  SEED_COURTS,
  SEED_PRICE_EFFECTIVE_FROM,
  SeedError,
  assertManifestConsistency,
  parseSeedMode,
  resolveSeedEnvironment,
} from './seed-data.mjs';

const cliArgs = process.argv.slice(2).filter((argument) => argument !== '--');

async function main() {
  const mode = parseSeedMode(cliArgs);
  assertManifestConsistency();
  // Guard env/mode before opening a connection so denied runs perform no I/O.
  const config = resolveSeedEnvironment(process.env, mode);
  const client = new pg.Client({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  const counts = {
    branch: 0,
    courts: 0,
    hours: 0,
    prices: 0,
    admin: 0,
    skipped: 0,
  };
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '5000ms'");
    await client.query("SET LOCAL statement_timeout = '30000ms'");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext('booking:seed:v1'))",
    );
    const plan = await preflight(client, config);
    await apply(client, config, plan, counts);
    await client.query('COMMIT');
    console.log(
      `Seed ${mode}: branch=${counts.branch} courts=${counts.courts} hours=${counts.hours} prices=${counts.prices} admin=${counts.admin} skipped=${counts.skipped}.`,
    );
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    fail(error);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function preflight(client, config) {
  const branchById = await client.query(
    'SELECT id FROM branches WHERE id = $1',
    [SEED_BRANCH.id],
  );
  const branchByCode = await client.query(
    'SELECT id FROM branches WHERE code = $1',
    [SEED_BRANCH.code],
  );
  if (
    branchByCode.rowCount > 0 &&
    branchByCode.rows[0].id !== SEED_BRANCH.id
  ) {
    throw new SeedError(
      'SEED_NATURAL_KEY_CONFLICT',
      `Mã chi nhánh ${SEED_BRANCH.code} đang thuộc một bản ghi không do seed quản lý.`,
    );
  }

  const courtIds = SEED_COURTS.map((court) => court.id);
  const courtCodes = SEED_COURTS.map((court) => court.code);
  const courtsById = await client.query(
    'SELECT id, branch_id FROM courts WHERE id = ANY($1::uuid[])',
    [courtIds],
  );
  const courtsByCode = await client.query(
    'SELECT id, code FROM courts WHERE branch_id = $1 AND code = ANY($2::text[])',
    [SEED_BRANCH.id, courtCodes],
  );
  const existingCourts = new Map(courtsById.rows.map((row) => [row.id, row]));
  const codeOwners = new Map(courtsByCode.rows.map((row) => [row.code, row.id]));

  const hoursResult = await client.query(
    'SELECT day_of_week FROM branch_business_hours WHERE branch_id = $1',
    [SEED_BRANCH.id],
  );
  const existingDays = new Set(
    hoursResult.rows.map((row) => Number(row.day_of_week)),
  );

  const priceResult = await client.query(
    'SELECT id FROM price_rules WHERE id = ANY($1::uuid[])',
    [SEED_COURTS.map((court) => court.priceId)],
  );
  const existingPrices = new Set(priceResult.rows.map((row) => row.id));

  const courts = [];
  for (const court of SEED_COURTS) {
    const existing = existingCourts.get(court.id);
    if (existing && existing.branch_id !== SEED_BRANCH.id) {
      throw new SeedError(
        'SEED_NATURAL_KEY_CONFLICT',
        `Sân ${court.code} đang trực thuộc chi nhánh khác; không tự chuyển ownership.`,
      );
    }
    const codeOwner = codeOwners.get(court.code);
    if (!existing && codeOwner && codeOwner !== court.id) {
      throw new SeedError(
        'SEED_NATURAL_KEY_CONFLICT',
        `Mã sân ${court.code} đang bị UUID không do seed quản lý chiếm giữ.`,
      );
    }
    let priceAction = 'skip';
    if (!existingPrices.has(court.priceId)) {
      const overlap = await client.query(
        `SELECT id FROM price_rules
         WHERE court_id = $1
           AND id <> ALL($2::uuid[])
           AND is_active = TRUE
           AND start_time < $3::time
           AND end_time > $4::time
           AND (effective_to IS NULL OR effective_to >= $5::date)`,
        [
          court.id,
          [court.priceId],
          SEED_BUSINESS_HOURS.closeTime,
          SEED_BUSINESS_HOURS.openTime,
          SEED_PRICE_EFFECTIVE_FROM,
        ],
      );
      if (overlap.rowCount > 0) {
        throw new SeedError(
          'SEED_CUSTOMIZATION_CONFLICT',
          `Sân ${court.code} đã có bảng giá tùy chỉnh chồng lấn; không tự ghi đè giá.`,
        );
      }
      priceAction = 'insert';
    }
    courts.push({
      court,
      exists: Boolean(existing),
      priceAction,
    });
  }

  const plan = {
    branchExists: branchById.rowCount > 0,
    missingDays: SEED_BUSINESS_HOURS.days.filter(
      (day) => !existingDays.has(day),
    ),
    courts,
    admin: null,
  };
  if (config.admin) {
    plan.admin = await preflightAdmin(client, config.admin);
  }
  return plan;
}

async function preflightAdmin(client, admin) {
  const existing = await client.query(
    'SELECT id FROM users WHERE id = $1',
    [admin.id],
  );
  if (existing.rowCount > 0) {
    const shape = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM user_profiles WHERE user_id = $1) AS profiles,
         (SELECT COUNT(*) FROM user_roles WHERE user_id = $1 AND role = 'ADMIN') AS admin_roles`,
      [SEED_ADMIN_USER_ID],
    );
    const profiles = Number(shape.rows[0].profiles);
    const adminRoles = Number(shape.rows[0].admin_roles);
    if (profiles !== 1 || adminRoles !== 1) {
      throw new SeedError(
        'SEED_ADMIN_REPAIR_REQUIRED',
        'Admin bootstrap tồn tại nhưng thiếu profile/role; cần xử lý thủ công, seed không tự nâng quyền.',
      );
    }
    return { exists: true };
  }
  const conflict = await client.query(
    `SELECT id FROM users
     WHERE username = $1 OR email = $2 OR phone = $3
     LIMIT 1`,
    [admin.username, admin.email, admin.phone],
  );
  if (conflict.rowCount > 0) {
    throw new SeedError(
      'SEED_NATURAL_KEY_CONFLICT',
      'Username/email/phone của Admin bootstrap đang thuộc tài khoản khác; seed không tự chiếm hoặc nâng quyền.',
    );
  }
  return { exists: false };
}

async function apply(client, config, plan, counts) {
  if (!plan.branchExists) {
    await insert(client, 'branch', {
      text: `INSERT INTO branches (id, code, name, address, phone, timezone, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, TRUE) RETURNING id`,
      values: [
        SEED_BRANCH.id,
        SEED_BRANCH.code,
        SEED_BRANCH.name,
        SEED_BRANCH.address,
        SEED_BRANCH.phone,
        SEED_BRANCH.timezone,
      ],
    });
    counts.branch++;
  } else {
    counts.skipped++;
  }

  for (const day of plan.missingDays) {
    const result = await client.query(
      `INSERT INTO branch_business_hours (branch_id, day_of_week, open_time, close_time)
       VALUES ($1, $2, $3::time, $4::time)
       ON CONFLICT (branch_id, day_of_week) DO NOTHING
       RETURNING id`,
      [
        SEED_BRANCH.id,
        day,
        SEED_BUSINESS_HOURS.openTime,
        SEED_BUSINESS_HOURS.closeTime,
      ],
    );
    counts.hours += result.rowCount;
    if (result.rowCount === 0) counts.skipped++;
  }

  for (const entry of plan.courts) {
    if (entry.exists) {
      counts.skipped++;
    } else {
      await insert(client, `court ${entry.court.code}`, {
        text: `INSERT INTO courts (id, branch_id, code, name, court_type, cleanup_minutes)
               VALUES ($1, $2, $3, $4, $5, 15) RETURNING id`,
        values: [
          entry.court.id,
          SEED_BRANCH.id,
          entry.court.code,
          entry.court.name,
          entry.court.courtType,
        ],
      });
      counts.courts++;
    }
    if (entry.priceAction === 'insert') {
      await insert(client, `price ${entry.court.code}`, {
        text: `INSERT INTO price_rules (id, court_id, start_time, end_time, price_per_hour, effective_from)
               VALUES ($1, $2, $3::time, $4::time, $5::numeric, $6::date) RETURNING id`,
        values: [
          entry.court.priceId,
          entry.court.id,
          SEED_BUSINESS_HOURS.openTime,
          SEED_BUSINESS_HOURS.closeTime,
          entry.court.pricePerHour,
          SEED_PRICE_EFFECTIVE_FROM,
        ],
      });
      counts.prices++;
    } else {
      counts.skipped++;
    }
  }

  if (config.admin && !plan.admin.exists) {
    const passwordHash = await argon.hash(config.admin.password);
    await insert(client, 'admin user', {
      text: `INSERT INTO users (id, username, email, phone, password_hash, status, email_verified_at)
             VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW()) RETURNING id`,
      values: [
        config.admin.id,
        config.admin.username,
        config.admin.email,
        config.admin.phone,
        passwordHash,
      ],
    });
    await client.query(
      'INSERT INTO user_profiles (user_id, full_name) VALUES ($1, $2)',
      [config.admin.id, config.admin.fullName],
    );
    await client.query(
      "INSERT INTO user_roles (user_id, role) VALUES ($1, 'ADMIN')",
      [config.admin.id],
    );
    counts.admin++;
  } else if (config.admin) {
    counts.skipped++;
  }
}

async function insert(client, label, query) {
  try {
    await client.query(query);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === '23505') {
      // A concurrent writer won the natural key after preflight.
      throw new SeedError(
        'SEED_NATURAL_KEY_CONFLICT',
        `Xung đột natural key khi ghi ${label}; toàn bộ mode đã rollback.`,
      );
    }
    throw error;
  }
}

function fail(error) {
  if (error instanceof SeedError) {
    console.error(`[seed] ${error.code}: ${error.message}`);
  } else if (error && typeof error === 'object' && typeof error.code === 'string') {
    console.error(`[seed] SEED_FAILED: ${error.name} (${error.code})`);
  } else {
    console.error(
      `[seed] SEED_FAILED: ${error instanceof Error ? error.name : 'UnknownError'}`,
    );
  }
  process.exitCode = 1;
}

await main();
