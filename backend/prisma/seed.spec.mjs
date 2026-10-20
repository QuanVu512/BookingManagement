import {
  SEED_ADMIN_USER_ID,
  SEED_BRANCH,
  SEED_COURTS,
  SeedError,
  assertManifestConsistency,
  buildAdminInput,
  normalizeVietnamPhone,
  parseSeedMode,
  resolveSeedEnvironment,
} from './seed-data.mjs';

const baseEnv = {
  NODE_ENV: 'development',
  SEED_ENABLED: 'true',
  DATABASE_URL: 'postgresql://user:secret@localhost:5433/pickleball?schema=public',
  SEED_ALLOWED_DATABASE: 'pickleball',
};

const adminEnv = {
  SEED_ADMIN_USERNAME: 'devadmin',
  SEED_ADMIN_EMAIL: 'Admin@Example.com',
  SEED_ADMIN_PHONE: '0901234567',
  SEED_ADMIN_FULL_NAME: 'Dev Admin',
  SEED_ADMIN_PASSWORD: 'a-strong-password',
};

describe('seed-data guards (RF-01A/B)', () => {
  it('defaults to courts mode and accepts explicit modes', () => {
    expect(parseSeedMode([])).toBe('courts');
    expect(parseSeedMode(['--mode=courts'])).toBe('courts');
    expect(parseSeedMode(['--mode=admin'])).toBe('admin');
    expect(parseSeedMode(['--mode=all'])).toBe('all');
  });

  it('rejects unknown modes and unknown arguments', () => {
    expect(() => parseSeedMode(['--mode=demo'])).toThrow(SeedError);
    expect(() => parseSeedMode(['--force'])).toThrow(SeedError);
    expect(() => parseSeedMode(['--mode=courts', '--drop'])).toThrow(SeedError);
  });

  it('rejects production before any connection is made', () => {
    expect(() =>
      resolveSeedEnvironment({ ...baseEnv, NODE_ENV: 'production' }, 'courts'),
    ).toThrow(/development hoặc test/);
  });

  it('requires SEED_ENABLED=true', () => {
    expect(() =>
      resolveSeedEnvironment({ ...baseEnv, SEED_ENABLED: 'false' }, 'courts'),
    ).toThrow(SeedError);
  });

  it('requires an explicit PostgreSQL DATABASE_URL', () => {
    expect(() =>
      resolveSeedEnvironment({ ...baseEnv, DATABASE_URL: '' }, 'courts'),
    ).toThrow(SeedError);
    expect(() =>
      resolveSeedEnvironment(
        { ...baseEnv, DATABASE_URL: 'mysql://localhost/x' },
        'courts',
      ),
    ).toThrow(SeedError);
  });

  it('allows loopback by default but blocks remote hosts without allowlist', () => {
    expect(resolveSeedEnvironment(baseEnv, 'courts').host).toBe('localhost');
    expect(() =>
      resolveSeedEnvironment(
        {
          ...baseEnv,
          DATABASE_URL: 'postgresql://user:secret@db.example.com:5432/pickleball',
        },
        'courts',
      ),
    ).toThrow(/SEED_ALLOWED_HOST/);
  });

  it('requires exact host and database allowlist matches', () => {
    const remote = {
      ...baseEnv,
      DATABASE_URL: 'postgresql://user:secret@db.example.com:5432/pickleball',
      SEED_ALLOWED_HOST: 'db.example.com',
    };
    expect(resolveSeedEnvironment(remote, 'courts').database).toBe('pickleball');
    expect(() =>
      resolveSeedEnvironment({ ...remote, SEED_ALLOWED_HOST: 'other.example.com' }, 'courts'),
    ).toThrow(SeedError);
    expect(() =>
      resolveSeedEnvironment({ ...remote, SEED_ALLOWED_DATABASE: 'other' }, 'courts'),
    ).toThrow(SeedError);
    expect(() =>
      resolveSeedEnvironment({ ...baseEnv, SEED_ALLOWED_DATABASE: '' }, 'courts'),
    ).toThrow(SeedError);
  });

  it('never leaks credentials through guard error messages', () => {
    try {
      resolveSeedEnvironment(
        {
          ...baseEnv,
          DATABASE_URL: 'postgresql://user:secret@db.example.com:5432/pickleball',
        },
        'courts',
      );
      throw new Error('expected denial');
    } catch (error) {
      expect(error.message).not.toContain('secret');
      expect(error.message).not.toContain('db.example.com');
    }
  });

  it('requires admin configuration for admin/all modes only', () => {
    expect(() =>
      resolveSeedEnvironment(baseEnv, 'admin'),
    ).toThrow(/SEED_ADMIN_USERNAME/);
    const config = resolveSeedEnvironment(
      { ...baseEnv, ...adminEnv },
      'admin',
    );
    expect(config.admin.id).toBe(SEED_ADMIN_USER_ID);
    expect(config.admin.email).toBe('admin@example.com');
    expect(config.admin.phone).toBe('+84901234567');
  });

  it('validates admin fields with the registration policy', () => {
    expect(() =>
      buildAdminInput({ ...adminEnv, SEED_ADMIN_USERNAME: 'short' }),
    ).toThrow(SeedError);
    expect(() =>
      buildAdminInput({ ...adminEnv, SEED_ADMIN_USERNAME: '12345678' }),
    ).toThrow(SeedError);
    expect(() =>
      buildAdminInput({ ...adminEnv, SEED_ADMIN_EMAIL: 'not-an-email' }),
    ).toThrow(SeedError);
    expect(() =>
      buildAdminInput({ ...adminEnv, SEED_ADMIN_PHONE: '12345' }),
    ).toThrow(SeedError);
    expect(() =>
      buildAdminInput({ ...adminEnv, SEED_ADMIN_PASSWORD: 'short' }),
    ).toThrow(SeedError);
    expect(() =>
      buildAdminInput({ ...adminEnv, SEED_ADMIN_FULL_NAME: '   ' }),
    ).toThrow(SeedError);
  });

  it('normalizes Vietnamese phone numbers to +84 form', () => {
    expect(normalizeVietnamPhone('0901234567')).toBe('+84901234567');
    expect(normalizeVietnamPhone('+84901234567')).toBe('+84901234567');
    expect(normalizeVietnamPhone('0123')).toBeNull();
  });

  it('keeps the manifest stable and collision-free', () => {
    expect(assertManifestConsistency()).toBe(true);
    expect(SEED_COURTS).toHaveLength(4);
    const ids = new Set([SEED_BRANCH.id, ...SEED_COURTS.map((court) => court.id)]);
    expect(ids.size).toBe(5);
    expect(SEED_BRANCH.id).not.toBe(SEED_ADMIN_USER_ID);
  });
});
