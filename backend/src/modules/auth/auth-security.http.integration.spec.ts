import 'reflect-metadata';
import { AuthAuditMiddleware } from './presentation/auth-audit.middleware.js';
import { SecurityAudit, type SecurityEvent } from './ports/security-audit.js';
import { authJwtOptions } from './helpers/auth-config.js';
import { SessionTokenSigner } from './ports/session-token-signer.js';
import { JwtSessionTokenSigner } from './infrastructure/jwt-session-token-signer.js';
import { securityHeaders } from '../../common/security-http.js';
import { AccountStore } from './ports/account-store.js';
import { PrismaAccountStore } from './infrastructure/prisma-account-store.js';
import { PasswordHasher } from './ports/password-hasher.js';
import { ArgonPasswordHasher } from './infrastructure/argon-password-hasher.js';
import { AuthCookiePresenter } from './presentation/auth-cookie.presenter.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { Controller, Get, UseGuards, ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import argon from 'argon2';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { Role, UserStatus } from '../../enums/index.js';
import { REQUEST_VALIDATION_OPTIONS } from '../../constants/validation.constants.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuthRedisStore } from './services/auth-redis.store.js';
import { AuthSessionService } from './services/auth-session.service.js';
import { AuthCsrfService } from './services/auth-csrf.service.js';
import { AuthRateLimitService } from './services/auth-rate-limit.service.js';
import { AuthOneTimeTokenService } from './services/auth-one-time-token.service.js';
import { AuthRecoveryService } from './services/auth-recovery.service.js';
import { AuthMailService } from './services/auth-mail.service.js';
import { CompromisedPasswordService } from './services/compromised-password.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from './guards/auth-csrf.guard.js';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Roles } from './decorators/roles.decorator.js';

const HTTP_SECURITY_TEST_TIMEOUT_MS = 30_000;
jest.setTimeout(HTTP_SECURITY_TEST_TIMEOUT_MS);

const SECRET =
  '21d36eeec4567a8b969e3b012c703672b753fbcba854d3a05163b64b19e40a79';
const ORIGIN = 'http://localhost:4001';
const ACCOUNT = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'customer',
  email: 'customer@example.com',
  phone: '+84912345678',
  passwordHash: 'test-hash',
  status: UserStatus.ACTIVE,
  tokenVersion: 0,
  emailVerifiedAt: new Date(),
  profile: { fullName: 'Customer' },
  roles: [{ role: Role.STAFF }],
};

// Test-only routes exercise existing OR-role metadata; no production permission changes.
@Controller('test-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
class AuthorizationFixtureController {
  @Get('staff') @Roles(Role.STAFF, Role.MANAGER) staff() {
    return { success: true };
  }
  @Get('unrestricted') unrestricted() {
    return { success: true };
  }
}

describe('Auth security HTTP integration (real guards/JWT, simulated DB/Redis/mail)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let jwt: JwtService;
  let sessions: AuthSessionService;
  let tokens: AuthOneTimeTokenService;
  const auditRecord = jest.fn<(event: SecurityEvent) => void>();
  let account:
    | (Omit<typeof ACCOUNT, 'emailVerifiedAt'> & {
        emailVerifiedAt: Date | null;
      })
    | null;
  const entries = new Map<string, { value: string; expires: number }>();
  const get = jest.fn<(key: string) => Promise<string | null>>();
  const set =
    jest.fn<
      (key: string, value: string, options: { EX: number }) => Promise<string>
    >();
  const sendToken =
    jest.fn<(purpose: string, email: string, token: string) => Promise<void>>();
  const findUnique =
    jest.fn<
      (query: { where: { id?: string; email?: string } }) => Promise<unknown>
    >();
  const findFirst = jest.fn<() => Promise<unknown>>();
  const updateMany = jest.fn<() => Promise<{ count: number }>>();
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        PassportModule,
        JwtModule.register(
          authJwtOptions(new ConfigService({ JWT_SECRET: SECRET })),
        ),
      ],
      controllers: [AuthController, AuthorizationFixtureController],
      providers: [
        AuthAuditMiddleware,
        { provide: SecurityAudit, useValue: { record: auditRecord } },
        AuthService,
        { provide: SessionTokenSigner, useClass: JwtSessionTokenSigner },
        { provide: AccountStore, useClass: PrismaAccountStore },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        AuthCookiePresenter,
        AuthRedisStore,
        AuthSessionService,
        AuthCsrfService,
        AuthRateLimitService,
        AuthOneTimeTokenService,
        AuthRecoveryService,
        JwtStrategy,
        JwtAuthGuard,
        AuthCsrfGuard,
        AuthRateLimitGuard,
        RolesGuard,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'test',
            JWT_SECRET: SECRET,
            WEB_ORIGIN: ORIGIN,
          }),
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique,
              findFirst,
              updateMany,
              create: async () => ({ ...ACCOUNT, emailVerifiedAt: null }),
            },
            $transaction: async (
              callback: (transaction: object) => Promise<unknown>,
            ) =>
              callback({
                user: {
                  create: async () => ({ ...ACCOUNT, emailVerifiedAt: null }),
                },
              }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            client: {
              get,
              set,
              getDel: async (key: string) => {
                const value = await get(key);
                entries.delete(key);
                return value;
              },
              eval: async (
                _script: string,
                options: { keys: string[]; arguments: string[] },
              ) => {
                if (_script.includes('HGET')) {
                  const key = options.keys[0];
                  if (entries.has(key)) return 0;
                  entries.set(key, { value: '1', expires: Date.now() + 60000 });
                  return 1;
                }
                const key = options.keys[0];
                const current = await get(key);
                const count = Number(current ?? '0') + 1;
                const ttl = Number(options.arguments[0]);
                const expires =
                  entries.get(key)?.expires ?? Date.now() + ttl * 1000;
                entries.set(key, { value: String(count), expires });
                return [
                  count,
                  Math.max(0, Math.ceil((expires - Date.now()) / 1000)),
                ];
              },
            },
          },
        },
        {
          provide: CompromisedPasswordService,
          useValue: { assertAllowed: async () => undefined },
        },
        { provide: AuthMailService, useValue: { sendToken } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.use(securityHeaders);
    const audit = module.get(AuthAuditMiddleware);
    app.use(audit.use.bind(audit));
    app.useGlobalPipes(new ValidationPipe(REQUEST_VALIDATION_OPTIONS));
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
    jwt = module.get(JwtService);
    sessions = module.get(AuthSessionService);
    tokens = module.get(AuthOneTimeTokenService);
  });
  beforeEach(() => {
    entries.clear();
    auditRecord.mockClear();
    account = structuredClone(ACCOUNT);
    get.mockReset().mockImplementation(async (key) => {
      const entry = entries.get(key);
      if (!entry || entry.expires <= Date.now()) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    });
    set.mockReset().mockImplementation(async (key, value, { EX }) => {
      entries.set(key, { value, expires: Date.now() + EX * 1000 });
      return 'OK';
    });
    findUnique.mockReset().mockImplementation(async () => account);
    findFirst.mockReset().mockImplementation(async () => account);
    updateMany.mockReset().mockImplementation(async () => {
      if (!account) return { count: 0 };
      account.tokenVersion++;
      return { count: 1 };
    });
    sendToken.mockReset().mockResolvedValue();
    jest.spyOn(argon, 'verify').mockResolvedValue(true);
    jest.spyOn(argon, 'hash').mockResolvedValue('new-test-hash');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await app.close();
  });
  async function signedToken() {
    return jwt.signAsync(sessions.claims(ACCOUNT.id, ACCOUNT.tokenVersion));
  }
  async function csrf() {
    const response = await fetch(`${baseUrl}/api/auth/csrf`);
    const body = (await response.json()) as { token: string };
    return {
      token: body.token,
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
    };
  }
  async function post(
    endpoint: string,
    payload: unknown,
    accessToken?: string,
  ) {
    const issued = await csrf();
    return fetch(`${baseUrl}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: ORIGIN,
        'X-CSRF-Token': issued.token,
        Cookie: `${issued.cookie}${accessToken ? `; access_token=${accessToken}` : ''}`,
      },
      body: JSON.stringify(payload),
    });
  }
  function read(endpoint: string, token: string) {
    return fetch(`${baseUrl}${endpoint}`, {
      headers: { Cookie: `access_token=${token}` },
    });
  }

  it('authenticates a login, logs out, and rejects the identical copied cookie server-side', async () => {
    const response = await post('login', {
      username: ACCOUNT.username,
      password: 'long password phrase',
    });
    expect(response.status).toBe(200);
    const token = /access_token=([^;]+)/.exec(
      response.headers.get('set-cookie') ?? '',
    )?.[1];
    if (!token) throw new Error('Login did not issue an access cookie');
    expect((await read('/api/auth/me', token)).status).toBe(200);
    const logout = await post('logout', {}, token);
    expect(logout.status).toBe(200);
    expect(logout.headers.get('set-cookie')).toContain('access_token=;');
    expect((await read('/api/auth/me', token)).status).toBe(401);
  });
  it('rejects incorrect credentials and unverified email without issuing cookies', async () => {
    jest.spyOn(argon, 'verify').mockResolvedValueOnce(false);
    expect(
      (
        await post('login', {
          username: ACCOUNT.username,
          password: 'long password phrase',
        })
      ).status,
    ).toBe(401);
    if (account) account.emailVerifiedAt = null;
    const response = await post('login', {
      username: ACCOUNT.username,
      password: 'long password phrase',
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('rejects expired JWTs and unauthenticated GET without requiring CSRF', async () => {
    const expired = await jwt.signAsync(sessions.claims(ACCOUNT.id, 0), {
      expiresIn: -1,
    });
    expect((await read('/api/auth/me', expired)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/auth/me`)).status).toBe(401);
  });
  it.each([UserStatus.SUSPENDED, UserStatus.CLOSED])(
    'rejects an already-issued token after account becomes %s',
    async (status) => {
      const token = await signedToken();
      if (account) account.status = status;
      expect((await read('/api/auth/me', token)).status).toBe(401);
    },
  );
  it('uses current roles with OR metadata and leaves routes without role metadata accessible', async () => {
    const token = await signedToken();
    expect((await read('/test-auth/staff', token)).status).toBe(200);
    if (account) account.roles = [{ role: Role.CUSTOMER }];
    expect((await read('/test-auth/staff', token)).status).toBe(403);
    expect((await read('/test-auth/unrestricted', token)).status).toBe(200);
    if (account) account.roles = [{ role: Role.MANAGER }];
    expect((await read('/test-auth/staff', token)).status).toBe(200);
  });
  it('fails closed for deleted/version-changed accounts and Redis/DB outages', async () => {
    const token = await signedToken();
    if (account) account.tokenVersion++;
    expect((await read('/api/auth/me', token)).status).toBe(401);
    account = null;
    expect((await read('/api/auth/me', token)).status).toBe(401);
    account = structuredClone(ACCOUNT);
    get.mockRejectedValueOnce(new Error('connection details'));
    expect((await read('/api/auth/me', token)).status).toBe(503);
    findUnique.mockRejectedValueOnce(new Error('db details'));
    expect((await read('/api/auth/me', token)).status).toBe(503);
  });
  it('does not confirm logout or clear the cookie when revocation fails', async () => {
    const token = await signedToken();
    const issued = await csrf();
    set.mockRejectedValueOnce(new Error('redis unavailable'));
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        Origin: ORIGIN,
        'X-CSRF-Token': issued.token,
        Cookie: `${issued.cookie}; access_token=${token}`,
      },
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await read('/api/auth/me', token)).status).toBe(200);
  });
  it.each([
    'login',
    'register',
    'logout',
    'verify-email',
    'resend-verification',
    'forgot-password',
    'reset-password',
  ])('requires CSRF for POST %s', async (endpoint) => {
    const response = await fetch(`${baseUrl}/api/auth/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: '{}',
    });
    expect(response.status).toBe(403);
  });
  it('rejects a hostile Origin even with a valid synchronizer token', async () => {
    const issued = await csrf();
    const response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
        'X-CSRF-Token': issued.token,
        Cookie: issued.cookie,
      },
      body: JSON.stringify({
        username: 'customer',
        password: 'long password phrase',
      }),
    });
    expect(response.status).toBe(403);
    expect(argon.verify).not.toHaveBeenCalled();
  });
  it('returns 429 with Retry-After for login identifier limits', async () => {
    for (let attempt = 0; attempt < 5; attempt++)
      expect(
        (
          await post('login', {
            username: 'customer',
            password: 'long password phrase',
          })
        ).status,
      ).toBe(200);
    const blocked = await post('login', {
      username: ' CUSTOMER ',
      password: 'long password phrase',
    });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });
  it('returns 429 with Retry-After for register IP limits without issuing sessions', async () => {
    if (account) account.emailVerifiedAt = null;
    findFirst.mockResolvedValue(null);
    const payload = {
      username: 'customer',
      fullName: 'Customer',
      email: ACCOUNT.email,
      phone: ACCOUNT.phone,
      password: 'long password phrase',
      confirmPassword: 'long password phrase',
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await post('register', payload);
      expect(response.status).toBe(201);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(sendToken).toHaveBeenCalledTimes(1);
    expect(sendToken).toHaveBeenLastCalledWith(
      'verify-email',
      ACCOUNT.email,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    const blocked = await post('register', payload);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('returns identical forgot-password HTTP status/body for existing and missing accounts', async () => {
    findUnique.mockImplementation(async (query) =>
      query.where.email === ACCOUNT.email ? account : null,
    );
    const [existing, missing] = await Promise.all([
      post('forgot-password', { email: ACCOUNT.email }),
      post('forgot-password', { email: 'missing@example.com' }),
    ]);
    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(await existing.json()).toEqual(await missing.json());
    expect(sendToken).toHaveBeenCalledTimes(1);
    expect(sendToken).toHaveBeenCalledWith(
      'reset-password',
      ACCOUNT.email,
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
  });
  it('reset rejects replay and invalidates a previously copied access token', async () => {
    const access = await signedToken();
    const token = await tokens.issue('reset-password', {
      id: ACCOUNT.id,
      email: ACCOUNT.email,
      tokenVersion: 0,
    });
    const payload = {
      token,
      password: 'new password phrase',
      confirmPassword: 'new password phrase',
    };
    expect((await post('reset-password', payload)).status).toBe(200);
    expect((await read('/api/auth/me', access)).status).toBe(401);
    expect((await post('reset-password', payload)).status).toBe(400);
  });
  it('sets private no-store and security headers on successful and failed auth responses', async () => {
    const token = await signedToken();
    const responses = [
      await read('/api/auth/me', token),
      await read('/api/auth/me'),
      await post('login', { username: 'bad', password: 'bad' }),
    ];
    for (const response of responses) {
      expect(response.headers.get('cache-control')).toBe('no-store, private');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
    }
    get.mockRejectedValueOnce(new Error('Redis unavailable'));
    const failure = await read('/api/auth/me', token);
    expect(failure.status).toBe(503);
    expect(failure.headers.get('cache-control')).toBe('no-store, private');
  });
  it('rate limits recovery before delivery and reset before password hashing', async () => {
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        post('forgot-password', { email: `person${index}@example.com` }),
      ),
    );
    expect(
      responses.filter((response) => response.status === 429),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 200),
    ).toHaveLength(5);
    for (let index = 0; index < 10; index++)
      await post('reset-password', { token: 'invalid' });
    const blocked = await post('reset-password', { token: 'invalid' });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).not.toBeNull();
    expect(argon.hash).not.toHaveBeenCalled();
  });

  it('applies auth cache and audit policy to case-insensitive Express routes', async () => {
    const response = await read('/API/AUTH/me');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store, private');
    const login = await post('LOGIN', {
      username: ACCOUNT.username,
      password: 'synthetic valid password',
    });
    expect(login.status).toBe(200);
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login', outcome: 'success' }),
    );
  });
  it('audits success and failures with bounded server-generated request IDs and no raw credentials', async () => {
    const success = await post('login', {
      username: ACCOUNT.username,
      password: 'synthetic valid password',
    });
    expect(success.status).toBe(200);
    jest.spyOn(argon, 'verify').mockResolvedValueOnce(false);
    const failure = await post('login', {
      username: ACCOUNT.username,
      password: 'bad',
    });
    // RF-02: short legacy passwords are valid input and must reach the
    // hasher; a wrong credential is rejected as generic 401, not 400.
    expect(failure.status).toBe(401);
    expect(argon.verify).toHaveBeenCalledWith(ACCOUNT.passwordHash, 'bad');
    expect(auditRecord.mock.calls.map(([event]) => event.outcome)).toEqual([
      'success',
      'denied',
    ]);
    for (const [event] of auditRecord.mock.calls)
      expect(event.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(JSON.stringify(auditRecord.mock.calls)).not.toMatch(
      /synthetic valid password|customer@example.com/,
    );
  });
});
