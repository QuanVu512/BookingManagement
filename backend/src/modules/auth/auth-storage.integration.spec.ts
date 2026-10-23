import { PasswordHasher } from './ports/password-hasher.js';
import { ArgonPasswordHasher } from './infrastructure/argon-password-hasher.js';
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
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createClient } from 'redis';
import { randomInt, randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../infrastructure/redis/redis.service.js';
import { Role, UserStatus } from '../../enums/index.js';
import { AuthRedisStore } from './services/auth-redis.store.js';
import { AuthSessionService } from './services/auth-session.service.js';
import { AuthOneTimeTokenService } from './services/auth-one-time-token.service.js';
import { AuthRecoveryService } from './services/auth-recovery.service.js';
import { EmailOtpService } from './services/email-otp.service.js';
import { AuthMailService } from './services/auth-mail.service.js';
import { CompromisedPasswordService } from './services/compromised-password.service.js';
import {
  AuthRateLimitService,
  AUTH_RATE_COUNTER_SCRIPT,
  AUTH_RECIPIENT_SCRIPT,
} from './services/auth-rate-limit.service.js';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import argon from 'argon2';

const databaseUrl = process.env.AUTH_SECURITY_DATABASE_TEST_URL;
const redisUrl = process.env.AUTH_SECURITY_REDIS_TEST_URL;
if (
  process.env.AUTH_SECURITY_REQUIRE_STORAGE === 'true' &&
  (!databaseUrl || !redisUrl)
) {
  throw new Error(
    'Mandatory auth storage tests require explicit disposable database and Redis URLs.',
  );
}
const liveDescribe = databaseUrl && redisUrl ? describe : describe.skip;

liveDescribe(
  'Auth storage integration in explicitly isolated disposable infrastructure',
  () => {
    let prisma: PrismaService;
    let redis: ReturnType<typeof createClient>;
    let store: AuthRedisStore;
    let sessions: AuthSessionService;
    let tokens: AuthOneTimeTokenService;
    let recovery: AuthRecoveryService;
    let otp: EmailOtpService;
    const sendEmailOtp =
      jest.fn<(email: string, code: string) => Promise<void>>();
    const id = randomUUID();
    const email = `auth-${id}@example.com`;
    const trackedKeys = new Set<string>();
    beforeAll(async () => {
      const database = new URL(databaseUrl ?? '');
      const cache = new URL(redisUrl ?? '');
      if (
        database.hostname !== '127.0.0.1' ||
        database.pathname !== '/auth_security_test' ||
        cache.hostname !== '127.0.0.1'
      )
        throw new Error(
          'Only explicit disposable loopback test infrastructure is permitted.',
        );
      prisma = new PrismaService(
        new ConfigService({ DATABASE_URL: databaseUrl }),
      );
      redis = createClient({ url: redisUrl });
      await redis.connect();
      await prisma.$connect();
      const module = await Test.createTestingModule({
        providers: [
          AuthRedisStore,
          AuthSessionService,
          AuthOneTimeTokenService,
          AuthRecoveryService,
          EmailOtpService,
          {
            provide: ConfigService,
            useValue: new ConfigService({
              AUTH_OTP_HMAC_SECRET: '1234567890abcdef'.repeat(4),
            }),
          },
          { provide: PasswordHasher, useClass: ArgonPasswordHasher },
          {
            provide: AuthRateLimitService,
            useValue: { reserveRecipient: async () => true },
          },
          { provide: PrismaService, useValue: prisma },
          { provide: RedisService, useValue: { client: redis } },
          {
            provide: AuthMailService,
            useValue: { sendToken: async () => undefined, sendEmailOtp },
          },
          {
            provide: CompromisedPasswordService,
            useValue: { assertAllowed: async () => undefined },
          },
        ],
      }).compile();
      store = module.get(AuthRedisStore);
      sessions = module.get(AuthSessionService);
      tokens = module.get(AuthOneTimeTokenService);
      recovery = module.get(AuthRecoveryService);
      otp = module.get(EmailOtpService);
    });
    beforeEach(async () => {
      sendEmailOtp.mockReset().mockResolvedValue();
      const evaluate = store.evaluate.bind(store);
      jest.spyOn(store, 'set').mockImplementation(async (key, value, ttl) => {
        trackedKeys.add(key);
        return redis.set(key, value, { EX: ttl });
      });
      jest.spyOn(store, 'evaluate').mockImplementation((script, key, args) => {
        trackedKeys.add(key);
        return evaluate(script, key, args);
      });
      await prisma.user.upsert({
        where: { id },
        create: {
          id,
          username: `auth${id.replaceAll('-', '')}`,
          email,
          phone: `+849${String(randomInt(0, 100000000)).padStart(8, '0')}`,
          passwordHash: 'test-hash',
          status: UserStatus.ACTIVE,
          tokenVersion: 0,
          roles: { create: { role: Role.STAFF } },
        },
        update: {
          status: UserStatus.ACTIVE,
          tokenVersion: 0,
          emailVerifiedAt: null,
        },
      });
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });
    afterAll(async () => {
      if (prisma) {
        await prisma.userRole.deleteMany({ where: { userId: id } });
        await prisma.user.deleteMany({ where: { id } });
        await prisma.$disconnect();
      }
      if (redis?.isOpen) {
        if (trackedKeys.size) await redis.del([...trackedKeys]);
        await redis.close();
      }
    });
    it('executes atomic counters under concurrency with a real Redis TTL', async () => {
      const key = `booking:auth:v1:test-counter:${id}`;
      trackedKeys.add(key);
      const results = await Promise.all(
        Array.from({ length: 25 }, () =>
          store.evaluate(AUTH_RATE_COUNTER_SCRIPT, key, ['1']),
        ),
      );
      expect(
        results
          .map((result) => (Array.isArray(result) ? result[0] : null))
          .sort((left, right) => Number(left) - Number(right)),
      ).toEqual(Array.from({ length: 25 }, (_, index) => index + 1));
      expect(await redis.ttl(key)).toBeGreaterThanOrEqual(0);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(
        await store.evaluate(AUTH_RATE_COUNTER_SCRIPT, key, ['1']),
      ).toEqual([1, 1]);
    });
    it('admits one recipient concurrently, preserves cooldown and resets after finite TTL', async () => {
      const key = `booking:auth:v1:test-recipient:${id}`;
      trackedKeys.add(key);
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          store.evaluate(AUTH_RECIPIENT_SCRIPT, key, ['3', '2', '1']),
        ),
      );
      expect(results.filter((result) => result === 1)).toHaveLength(1);
      expect(await redis.ttl(key)).toBeGreaterThanOrEqual(0);
      await new Promise((resolveWait) => setTimeout(resolveWait, 2100));
      expect(
        await store.evaluate(AUTH_RECIPIENT_SCRIPT, key, ['3', '2', '1']),
      ).toBe(1);
    });
    it('consumes a one-time token once across concurrent Redis GETDEL calls', async () => {
      const token = await tokens.issue('verify-email', {
        id,
        email,
        tokenVersion: 0,
      });
      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () => tokens.consume('verify-email', token)),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === 'rejected'),
      ).toHaveLength(9);
    });
    it('verifies email once against PostgreSQL and rejects replay', async () => {
      const token = await tokens.issue('verify-email', {
        id,
        email,
        tokenVersion: 0,
      });
      await recovery.verifyEmail({ token });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id } }))
          .emailVerifiedAt,
      ).toBeInstanceOf(Date);
      await expect(recovery.verifyEmail({ token })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
    it('activates an account using OTP against real Redis and PostgreSQL and rejects replay', async () => {
      await otp.issue({ id, email, tokenVersion: 0 });
      const code = sendEmailOtp.mock.calls[0]?.[1];
      if (!code) throw new Error('Missing OTP fixture delivery');
      await otp.verifyEmail(email, code);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id } }))
          .emailVerifiedAt,
      ).toBeInstanceOf(Date);
      await expect(otp.verifyEmail(email, code)).rejects.toMatchObject({
        status: 400,
      });
    });
    it('rejects an OTP when the account version changes before activation', async () => {
      await otp.issue({ id, email, tokenVersion: 0 });
      const code = sendEmailOtp.mock.calls[0]?.[1];
      if (!code) throw new Error('Missing OTP fixture delivery');
      await prisma.user.update({ where: { id }, data: { tokenVersion: 1 } });
      await expect(otp.verifyEmail(email, code)).rejects.toMatchObject({
        status: 400,
      });
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { id } }))
          .emailVerifiedAt,
      ).toBeNull();
    });
    it('allows one concurrent reset across separate tokens via a PostgreSQL version compare-and-update', async () => {
      await prisma.user.update({
        where: { id },
        data: { emailVerifiedAt: new Date() },
      });
      const oldPayload = {
        ...sessions.claims(id, 0),
        exp: Math.floor(Date.now() / 1000) + 900,
      };
      await expect(sessions.authenticate(oldPayload)).resolves.toMatchObject({
        userId: id,
      });
      const issued = await Promise.all(
        Array.from({ length: 2 }, () =>
          tokens.issue('reset-password', { id, email, tokenVersion: 0 }),
        ),
      );
      const password = '  mật khẩu dài có dấu 😀  ';
      const results = await Promise.allSettled(
        issued.map((token) =>
          recovery.resetPassword({
            token,
            password,
            confirmPassword: password,
          }),
        ),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user.tokenVersion).toBe(1);
      expect(await argon.verify(user.passwordHash, password)).toBe(true);
      await expect(sessions.authenticate(oldPayload)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  },
);
