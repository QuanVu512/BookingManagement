import 'reflect-metadata';
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
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { request, spec } from 'pactum';
import { REQUEST_VALIDATION_OPTIONS } from '../src/constants/validation.constants.js';
import { securityHeaders } from '../src/common/security-http.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { PasswordHasher } from '../src/modules/auth/ports/password-hasher.js';
import { AuthMailService } from '../src/modules/auth/services/auth-mail.service.js';
import type { AuthTokenPurpose } from '../src/modules/auth/services/auth-mail.service.js';
import { AuthRedisStore } from '../src/modules/auth/services/auth-redis.store.js';
import { CompromisedPasswordService } from '../src/modules/auth/services/compromised-password.service.js';

const E2E_BOOTSTRAP_TIMEOUT_MS = 30_000;
const E2E_REQUEST_TIMEOUT_MS = 10_000;
const E2E_TEST_TIMEOUT_MS = 15_000;
const WEB_ORIGIN = 'http://localhost:4001';
const AUTH_PATH = '/api/auth';
const PASSWORD = 'Pactum test passphrase 47!';
const WRONG_PASSWORD = 'Incorrect test passphrase 47!';
const RUN_ID = randomUUID().replaceAll('-', '');

type HttpResponse = {
  json: Record<string, unknown>;
  headers: Record<string, unknown>;
};

// Keep the real Redis adapter, Lua counters and TTLs, with keys owned by this run.
class PactumRedisStore extends AuthRedisStore {
  private readonly keys = new Set<string>();
  constructor(private readonly testRedis: RedisService) {
    super(testRedis);
  }
  private isolate(key: string): string {
    const scopedKey = `pactum:${RUN_ID}:${key}`;
    this.keys.add(scopedKey);
    return scopedKey;
  }
  override get(key: string) {
    return super.get(this.isolate(key));
  }
  override set(key: string, value: string, ttl: number) {
    return super.set(this.isolate(key), value, ttl);
  }
  override consume(key: string) {
    return super.consume(this.isolate(key));
  }
  override evaluate(script: string, key: string, argumentsList: string[]) {
    return super.evaluate(script, this.isolate(key), argumentsList);
  }
  async clear(): Promise<void> {
    if (this.keys.size) await this.testRedis.client.del([...this.keys]);
    this.keys.clear();
  }
}

describe('Auth API (Pactum, real PostgreSQL/Redis)', () => {
  let app: INestApplication | undefined;
  let prisma: PrismaService;
  let store: PactumRedisStore;
  let sequence = 0;
  const usernames: string[] = [];
  const account = registration();
  const sendToken =
    jest.fn<
      (purpose: AuthTokenPurpose, email: string, token: string) => Promise<void>
    >();
  const assertAllowed = jest.fn<(password: string) => Promise<void>>();

  beforeAll(async () => {
    const config = testConfig();
    // Import CJS integrations after Nest's ESM runtime has initialized in Jest.
    const { AppModule } = await import('../src/app.module.js');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .overrideProvider(AuthMailService)
      .useValue({ sendToken })
      .overrideProvider(CompromisedPasswordService)
      .useValue({ assertAllowed })
      .overrideProvider(AuthRedisStore)
      .useFactory({
        factory: (redis: RedisService) => new PactumRedisStore(redis),
        inject: [RedisService],
      })
      .compile();
    app = module.createNestApplication();
    app.use(securityHeaders);
    app.enableCors({ origin: WEB_ORIGIN, credentials: true });
    app.useGlobalPipes(new ValidationPipe(REQUEST_VALIDATION_OPTIONS));
    // Pactum sends real HTTP requests; port 0 avoids a conflict with the dev API.
    await app.listen(0, '127.0.0.1');
    request.setBaseUrl(await app.getUrl());
    request.setDefaultTimeout(E2E_REQUEST_TIMEOUT_MS);
    prisma = module.get(PrismaService);
    store = module.get<PactumRedisStore>(AuthRedisStore);
    await seedVerifiedAccount(module.get(PasswordHasher));
  }, E2E_BOOTSTRAP_TIMEOUT_MS);

  beforeEach(() => {
    sendToken.mockReset().mockResolvedValue(undefined);
    assertAllowed.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (store) await store.clear();
  });

  afterAll(async () => {
    try {
      if (prisma) await cleanupAccounts();
    } finally {
      if (app) await app.close();
    }
  });

  it('listens on a free port and serves GET /', () =>
    spec().get('/').expectStatus(200).expectBody('Hello World!'));

  it('issues a CSRF token and HttpOnly context cookie with CORS and no cache', async () => {
    const response: HttpResponse = await spec()
      .get(`${AUTH_PATH}/csrf`)
      .withHeaders('Origin', WEB_ORIGIN)
      .expectStatus(200);
    expect(response.json.token).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie(response, 'auth_csrf_context')).toMatch(
      /^auth_csrf_context=[a-f0-9]{64}$/,
    );
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('rejects GET /me without a session', () =>
    spec().get(`${AUTH_PATH}/me`).expectStatus(401));

  it.each(['register', 'login'])(
    'rejects %s without CSRF',
    async (endpoint) => {
      await spec()
        .post(`${AUTH_PATH}/${endpoint}`)
        .withJson(account)
        .expectStatus(403);
      expect(sendToken).not.toHaveBeenCalled();
    },
  );

  it('rejects a valid CSRF token sent from another origin', async () => {
    const csrf = await issueCsrf();
    await spec()
      .post(`${AUTH_PATH}/login`)
      .withHeaders({
        Origin: 'http://localhost:4999',
        'X-CSRF-Token': csrf.token,
      })
      .withCookies(csrf.cookie)
      .withJson(credentials())
      .expectStatus(403);
  });

  it.each([
    ['missing fields', {}],
    ['invalid email', { email: 'invalid-email' }],
    ['invalid phone', { phone: '+12025550123' }],
    ['confirmation mismatch', { confirmPassword: WRONG_PASSWORD }],
    ['injected role', { roles: ['ADMIN'] }],
  ])(
    'rejects registration with %s without creating an account',
    async (name, invalid) => {
      const input = registration();
      const payload = name === 'missing fields' ? {} : { ...input, ...invalid };
      const response = await postAuth('register', payload, 400);
      expect(response.json.statusCode).toBe(400);
      expect(
        await prisma.user.findUnique({ where: { username: input.username } }),
      ).toBeNull();
      expect(assertAllowed).not.toHaveBeenCalled();
      expect(sendToken).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['missing credentials', {}],
    ['short password', { username: account.username, password: 'short' }],
  ])('rejects login with %s', async (_name, payload) => {
    const response = await postAuth('login', payload, 400);
    expect(response.json.statusCode).toBe(400);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it(
    'registers, requires email verification, consumes the email token once and logs in',
    async () => {
      const input = registration();
      const response = await postAuth(
        'register',
        {
          ...input,
          username: ` ${input.username} `,
          email: input.email.toUpperCase(),
          fullName: ` ${input.fullName} `,
        },
        201,
      );
      expect(response.json).toMatchObject({
        success: true,
        status: 'verification_required',
      });
      expect(Object.keys(response.json).sort()).toEqual([
        'message',
        'status',
        'success',
      ]);
      expect(response.headers['set-cookie']).toBeUndefined();
      await expectUnverifiedAccount(input);
      await postAuth('login', credentials(input.username), 401);
      const token = verificationToken(input.email);
      await postAuth('verify-email', { token }, 200);
      await postAuth('verify-email', { token }, 400);
      const session = await login(input.username);
      await expectSession(session, input.username);
    },
    E2E_TEST_TIMEOUT_MS,
  );

  it(
    'returns 409 for a duplicate username',
    async () => {
      const input = { ...registration(), username: account.username };
      const response = await postAuth('register', input, 409);
      expect(response.json.statusCode).toBe(409);
      expect(sendToken).not.toHaveBeenCalled();
      expect(
        await prisma.user.count({ where: { username: account.username } }),
      ).toBe(1);
    },
    E2E_TEST_TIMEOUT_MS,
  );

  it.each(['email', 'phone'] as const)(
    'hides a duplicate %s without creating another account',
    async (field) => {
      const input = { ...registration(), [field]: account[field] };
      const response = await postAuth('register', input, 201);
      expect(response.json).toMatchObject({
        success: true,
        status: 'verification_required',
      });
      expect(response.headers['set-cookie']).toBeUndefined();
      expect(
        await prisma.user.findUnique({ where: { username: input.username } }),
      ).toBeNull();
      expect(sendToken).not.toHaveBeenCalled();
    },
    E2E_TEST_TIMEOUT_MS,
  );

  it('rejects the wrong password without issuing an auth cookie', async () => {
    const response = await postAuth(
      'login',
      { ...credentials(), password: WRONG_PASSWORD },
      401,
    );
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(assertAllowed).not.toHaveBeenCalled();
  });

  it('rejects an unknown account without issuing an auth cookie', async () => {
    const response = await postAuth(
      'login',
      credentials(`unknown${RUN_ID}`),
      401,
    );
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each(['username', 'email', 'phone'] as const)(
    'logs in using %s and reads the session through the cookie',
    async (field) => {
      const session = await login(account[field]);
      await expectSession(session, account.username);
      expect(assertAllowed).not.toHaveBeenCalled();
    },
  );

  it('logs out, clears the cookie and rejects replay through cookie or Bearer', async () => {
    const session = await login();
    const response = await postAuth('logout', {}, 200, session);
    expect(response.json).toMatchObject({ success: true });
    expect(cookie(response, 'access_token')).toBe('access_token=');
    await spec().get(`${AUTH_PATH}/me`).withCookies(session).expectStatus(401);
    const token = session.slice('access_token='.length);
    await spec()
      .get(`${AUTH_PATH}/me`)
      .withBearerToken(token)
      .expectStatus(401);
  });

  function registration() {
    const username = `pactum${RUN_ID}${sequence++}`;
    usernames.push(username);
    return {
      username,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      email: `${username}@example.com`,
      fullName: 'Pactum Customer',
      phone: `090${randomInt(10_000_000).toString().padStart(7, '0')}`,
    };
  }

  function credentials(username = account.username) {
    return { username, password: PASSWORD };
  }

  async function seedVerifiedAccount(hasher: PasswordHasher): Promise<void> {
    await prisma.user.create({
      data: {
        username: account.username,
        email: account.email,
        phone: internationalPhone(account.phone),
        passwordHash: await hasher.hash(PASSWORD),
        emailVerifiedAt: new Date(),
        profile: { create: { fullName: account.fullName } },
        roles: { create: { role: 'CUSTOMER' } },
      },
    });
  }

  async function cleanupAccounts(): Promise<void> {
    const users = await prisma.user.findMany({
      where: { username: { in: usernames } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.$transaction([
      prisma.userRole.deleteMany({ where: { userId: { in: ids } } }),
      prisma.userProfile.deleteMany({ where: { userId: { in: ids } } }),
      prisma.user.deleteMany({ where: { id: { in: ids } } }),
    ]);
    expect(await prisma.user.count({ where: { id: { in: ids } } })).toBe(0);
  }

  async function expectUnverifiedAccount(
    input: ReturnType<typeof registration>,
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { username: input.username },
      include: { profile: true, roles: true },
    });
    expect(user).toMatchObject({
      email: input.email,
      phone: internationalPhone(input.phone),
      emailVerifiedAt: null,
      profile: { fullName: input.fullName },
      roles: [{ role: 'CUSTOMER' }],
    });
    expect(user.passwordHash).not.toBe(PASSWORD);
  }

  async function issueCsrf(): Promise<{ token: string; cookie: string }> {
    const response: HttpResponse = await spec()
      .get(`${AUTH_PATH}/csrf`)
      .expectStatus(200);
    const token = response.json.token;
    if (typeof token !== 'string') throw new Error('Missing CSRF token.');
    return { token, cookie: cookie(response, 'auth_csrf_context') };
  }

  async function postAuth(
    endpoint: string,
    payload: object,
    status: number,
    session = '',
  ): Promise<HttpResponse> {
    const csrf = await issueCsrf();
    return spec()
      .post(`${AUTH_PATH}/${endpoint}`)
      .withHeaders({ Origin: WEB_ORIGIN, 'X-CSRF-Token': csrf.token })
      .withCookies([csrf.cookie, session].filter(Boolean).join('; '))
      .withJson(payload)
      .expectStatus(status)
      .toss();
  }

  async function login(identifier = account.username): Promise<string> {
    const response = await postAuth('login', credentials(identifier), 200);
    expect(response.json.success).toBe(true);
    expect(Object.keys(response.json).sort()).toEqual([
      'message',
      'success',
      'user',
    ]);
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/access_token=.+;.*HttpOnly/),
      ]),
    );
    return cookie(response, 'access_token');
  }

  async function expectSession(
    session: string,
    username: string,
  ): Promise<void> {
    await spec()
      .get(`${AUTH_PATH}/me`)
      .withCookies(session)
      .expectStatus(200)
      .expect(({ res }) => {
        expect(res.json).toMatchObject({
          success: true,
          user: {
            username,
            roles: ['CUSTOMER'],
            primaryRole: 'CUSTOMER',
            isStaffOrAdmin: false,
          },
        });
        expect(Object.keys(res.json.user).sort()).toEqual([
          'email',
          'fullName',
          'id',
          'isStaffOrAdmin',
          'phone',
          'primaryRole',
          'roles',
          'username',
        ]);
      });
  }

  function verificationToken(email: string): string {
    const delivery = sendToken.mock.calls.find(
      ([purpose, recipient]) =>
        purpose === 'verify-email' && recipient === email,
    );
    if (!delivery)
      throw new Error('Expected verification email was not captured.');
    return delivery[2];
  }
});

function internationalPhone(phone: string): string {
  return phone.replace(/^0/, '+84');
}

function cookie(response: HttpResponse, name: string): string {
  const raw = response.headers['set-cookie'];
  const values = Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string')
    : [];
  const value = values.find((entry) => entry.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing ${name} cookie.`);
  return value.split(';')[0];
}

function testConfig(): ConfigService {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  if (!databaseUrl || !redisUrl)
    throw new Error(
      'Run E2E with DATABASE_URL and REDIS_URL from backend/.env.test.',
    );
  const redis = new URL(redisUrl);
  return new ConfigService({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    REDIS_HOST: redis.hostname,
    REDIS_PORT: redis.port,
    REDIS_PASSWORD: decodeURIComponent(redis.password),
    WEB_ORIGIN,
    JWT_SECRET: randomBytes(32).toString('hex'),
  });
}
