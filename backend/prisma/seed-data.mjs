/**
 * RF-01A/RF-01B — Seed manifest, mode/env guards and pure validation.
 * This module has no database or Nest dependency so the guards can be
 * unit-tested without a live target.
 */
export const SEED_MODES = ['courts', 'admin', 'all'];

export const SEED_BRANCH = {
  id: '10000000-0000-4000-8000-000000000001',
  code: 'MVP-DEMO',
  name: 'SMASH ARENA — Chi nhánh demo',
  address: 'Phù Đổng, Hà Nội',
  phone: '02400000000',
  timezone: 'Asia/Ho_Chi_Minh',
};

export const SEED_BUSINESS_HOURS = {
  openTime: '06:00',
  closeTime: '23:00',
  days: [1, 2, 3, 4, 5, 6, 7],
};

export const SEED_COURTS = [
  {
    id: '10000000-0000-4000-8000-000000000101',
    code: 'PRO-01',
    name: 'Center Court Pro 1',
    courtType: 'VIP',
    priceId: '10000000-0000-4000-8000-000000000201',
    pricePerHour: '280000',
  },
  {
    id: '10000000-0000-4000-8000-000000000102',
    code: 'PRO-02',
    name: 'Championship Arena 2',
    courtType: 'VIP',
    priceId: '10000000-0000-4000-8000-000000000202',
    pricePerHour: '240000',
  },
  {
    id: '10000000-0000-4000-8000-000000000103',
    code: 'STD-03',
    name: 'Pickle Standard 3',
    courtType: 'STANDARD',
    priceId: '10000000-0000-4000-8000-000000000203',
    pricePerHour: '170000',
  },
  {
    id: '10000000-0000-4000-8000-000000000104',
    code: 'STD-04',
    name: 'Dynamic Court 4',
    courtType: 'STANDARD',
    priceId: '10000000-0000-4000-8000-000000000204',
    pricePerHour: '160000',
  },
];

export const SEED_ADMIN_USER_ID = '10000000-0000-4000-8000-000000000901';

export const SEED_PRICE_EFFECTIVE_FROM = '2020-01-01';
export const SEED_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export const SEED_ADMIN_REQUIRED_ENV = [
  'SEED_ADMIN_USERNAME',
  'SEED_ADMIN_EMAIL',
  'SEED_ADMIN_PHONE',
  'SEED_ADMIN_FULL_NAME',
  'SEED_ADMIN_PASSWORD',
];

const USERNAME_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIETNAM_PHONE_PATTERN = /^(?:0|\+84)(?:[35789][0-9]{8}|2[0-9]{9})$/;

export class SeedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SeedError';
    this.code = code;
  }
}

export function parseSeedMode(argv) {
  let mode = 'courts';
  for (const argument of argv) {
    if (!argument.startsWith('--mode=')) {
      throw new SeedError(
        'SEED_INVALID_ARGUMENT',
        'Tham số seed không hợp lệ. Chỉ chấp nhận --mode=courts|admin|all.',
      );
    }
    const value = argument.slice('--mode='.length);
    if (!SEED_MODES.includes(value)) {
      throw new SeedError(
        'SEED_INVALID_MODE',
        'Mode seed không hợp lệ. Chỉ chấp nhận courts, admin hoặc all.',
      );
    }
    mode = value;
  }
  return mode;
}

export function resolveSeedEnvironment(env, mode) {
  const nodeEnv = env.NODE_ENV ?? '';
  if (nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'Seed chỉ chạy khi NODE_ENV là development hoặc test.',
    );
  }
  if (env.SEED_ENABLED !== 'true') {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'Seed bị tắt. Đặt SEED_ENABLED=true trong môi trường dev/test được phép.',
    );
  }
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'Cần DATABASE_URL tường minh cho seed (không đọc fallback .env).',
    );
  }
  const parsed = parseDatabaseUrl(databaseUrl);
  const allowedHost = (env.SEED_ALLOWED_HOST ?? '').trim().toLowerCase();
  const hostName = parsed.hostname.toLowerCase();
  if (allowedHost) {
    if (hostName !== allowedHost) {
      throw new SeedError(
        'SEED_ENV_DENIED',
        'Host DATABASE_URL không khớp SEED_ALLOWED_HOST.',
      );
    }
  } else if (!SEED_LOOPBACK_HOSTS.has(hostName)) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'Seed ngoài loopback cần SEED_ALLOWED_HOST khớp host DATABASE_URL.',
    );
  }
  const allowedDatabase = (env.SEED_ALLOWED_DATABASE ?? '').trim();
  if (!allowedDatabase || parsed.database !== allowedDatabase) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'SEED_ALLOWED_DATABASE phải khớp chính xác tên database đích.',
    );
  }
  const config = {
    mode,
    nodeEnv,
    databaseUrl,
    host: parsed.hostname,
    database: parsed.database,
  };
  if (mode === 'admin' || mode === 'all') {
    config.admin = buildAdminInput(env);
  }
  return config;
}

function parseDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new SeedError('SEED_ENV_DENIED', 'DATABASE_URL không hợp lệ.');
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'DATABASE_URL phải là PostgreSQL.',
    );
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new SeedError('SEED_ENV_DENIED', 'DATABASE_URL thiếu tên database.');
  }
  return { hostname: url.hostname, database };
}

export function buildAdminInput(env) {
  const missing = SEED_ADMIN_REQUIRED_ENV.filter(
    (key) => !(env[key] ?? '').trim(),
  );
  if (missing.length > 0) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      `Thiếu cấu hình Admin bắt buộc: ${missing.join(', ')}.`,
    );
  }
  const username = env.SEED_ADMIN_USERNAME.trim();
  const email = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const phone = normalizeVietnamPhone(env.SEED_ADMIN_PHONE);
  const fullName = env.SEED_ADMIN_FULL_NAME.trim();
  const password = env.SEED_ADMIN_PASSWORD;
  if (username.length < 8 || username.length > 100) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'SEED_ADMIN_USERNAME cần 8–100 ký tự.',
    );
  }
  if (!USERNAME_PATTERN.test(username)) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'SEED_ADMIN_USERNAME chỉ gồm chữ Latin và số, có ít nhất một chữ.',
    );
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    throw new SeedError('SEED_ENV_DENIED', 'SEED_ADMIN_EMAIL không hợp lệ.');
  }
  if (!phone) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'SEED_ADMIN_PHONE phải là số Việt Nam hợp lệ.',
    );
  }
  if (!fullName || fullName.length > 150) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'SEED_ADMIN_FULL_NAME bắt buộc, tối đa 150 ký tự.',
    );
  }
  const passwordLength = Array.from(password).length;
  if (passwordLength < 12 || passwordLength > 128) {
    throw new SeedError(
      'SEED_ENV_DENIED',
      'SEED_ADMIN_PASSWORD cần 12–128 ký tự.',
    );
  }
  return { id: SEED_ADMIN_USER_ID, username, email, phone, fullName, password };
}

export function normalizeVietnamPhone(value) {
  const input = String(value ?? '').trim();
  if (!VIETNAM_PHONE_PATTERN.test(input)) return null;
  return input.startsWith('+84') ? input : `+84${input.slice(1)}`;
}

export function assertManifestConsistency() {
  const ids = new Set([SEED_BRANCH.id, ...SEED_COURTS.map((court) => court.id)]);
  const codes = new Set(SEED_COURTS.map((court) => court.code));
  if (ids.size !== SEED_COURTS.length + 1 || codes.size !== SEED_COURTS.length) {
    throw new SeedError(
      'SEED_MANIFEST_INVALID',
      'Manifest seed chứa ID hoặc code trùng lặp.',
    );
  }
  for (const court of SEED_COURTS) {
    if (!court.priceId || SEED_COURTS.some((other) => other.id === court.priceId)) {
      throw new SeedError(
        'SEED_MANIFEST_INVALID',
        'Price ID seed phải tách biệt với court ID.',
      );
    }
    if (!/^\d+$/.test(court.pricePerHour)) {
      throw new SeedError(
        'SEED_MANIFEST_INVALID',
        'Giá seed phải là số VND nguyên.',
      );
    }
  }
  return true;
}
