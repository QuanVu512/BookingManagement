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
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { EmailOtpService } from './email-otp.service.js';
import { AuthRedisStore } from './auth-redis.store.js';
import { AuthMailService } from './auth-mail.service.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';

const redisUrl = process.env.AUTH_OTP_REDIS_TEST_URL;
const storageDescribe = redisUrl ? describe : describe.skip;

storageDescribe(
  'Email verification OTP with real Redis and a database boundary fixture',
  () => {
    const redis = createClient({ url: redisUrl });
    const mail = {
      sendEmailOtp: jest.fn<(email: string, code: string) => Promise<void>>(),
    };
    const updated = jest.fn(async () => ({}));
    const keys = new Set<string>();
    let otp: EmailOtpService;
    let store: AuthRedisStore;
    let account: { id: string; email: string; tokenVersion: number };
    let accountStatus = 'ACTIVE';
    let transactionFailure = false;
    let currentChallengeKey = '';

    beforeAll(async () => {
      const target = new URL(redisUrl ?? '');
      if (
        target.hostname !== '127.0.0.1' ||
        target.port !== '6381' ||
        target.pathname !== '/14'
      ) {
        throw new Error(
          'OTP tests require the explicit loopback test Redis on port 6381, database 14.',
        );
      }
      await redis.connect();
      const module = await Test.createTestingModule({
        providers: [
          EmailOtpService,
          AuthRedisStore,
          { provide: RedisService, useValue: { client: redis } },
          {
            provide: ConfigService,
            useValue: new ConfigService({
              EMAIL_OTP_ENABLED: 'true',
              AUTH_OTP_HMAC_SECRET: '1234567890abcdef'.repeat(4),
            }),
          },
          { provide: AuthMailService, useValue: mail },
          {
            provide: AuthRateLimitService,
            useValue: { reserveRecipient: async () => true },
          },
          {
            provide: PrismaService,
            useValue: {
              $transaction: async (
                callback: (transaction: object) => Promise<unknown>,
              ) => {
                if (transactionFailure)
                  throw new Error('fixture database unavailable');
                return callback({
                  $queryRaw: async () => [
                    {
                      id: account.id,
                      email: account.email,
                      token_version: account.tokenVersion,
                      status: accountStatus,
                      email_verified_at: null,
                    },
                  ],
                  user: { update: updated },
                });
              },
            },
          },
        ],
      }).compile();
      otp = module.get(EmailOtpService);
      store = module.get(AuthRedisStore);
    });
    beforeEach(() => {
      account = {
        id: randomUUID(),
        email: `otp-${randomUUID()}@example.com`,
        tokenVersion: 0,
      };
      accountStatus = 'ACTIVE';
      transactionFailure = false;
      mail.sendEmailOtp.mockReset().mockResolvedValue();
      updated.mockClear();
      const save = store.set.bind(store);
      const evaluate = store.evaluate.bind(store);
      jest.spyOn(store, 'set').mockImplementation(async (key, value, ttl) => {
        keys.add(key);
        currentChallengeKey = key;
        return save(key, value, ttl);
      });
      jest.spyOn(store, 'evaluate').mockImplementation((script, key, args) => {
        keys.add(key);
        return evaluate(script, key, args);
      });
    });
    afterEach(() => jest.restoreAllMocks());
    afterAll(async () => {
      if (redis.isOpen) {
        if (keys.size) await redis.del([...keys]);
        await redis.close();
      }
    });
    function codeAt(index: number): string {
      const code = mail.sendEmailOtp.mock.calls[index]?.[1];
      if (!code) throw new Error('Missing fixture code');
      return code;
    }
    async function expireRecord() {
      const raw = await redis.get(currentChallengeKey);
      if (!raw) throw new Error('Missing challenge');
      const record: Record<string, unknown> = JSON.parse(raw);
      const clock = await redis.sendCommand(['TIME']);
      if (!Array.isArray(clock)) throw new Error('Unexpected Redis clock');
      record.expiresAt = Number(clock[0]);
      await redis.set(currentChallengeKey, JSON.stringify(record), {
        KEEPTTL: true,
      });
    }
    it('sets a 300-second TTL, stores no plaintext OTP, activates once and rejects replay', async () => {
      await otp.issue(account);
      const code = codeAt(0);
      expect(await redis.ttl(currentChallengeKey)).toBeGreaterThanOrEqual(299);
      expect(await redis.ttl(currentChallengeKey)).toBeLessThanOrEqual(300);
      expect(
        JSON.parse((await redis.get(currentChallengeKey)) ?? '{}'),
      ).not.toHaveProperty('code');
      await otp.verifyEmail(account.email, code);
      expect(updated).toHaveBeenCalledTimes(1);
      await expect(otp.verifyEmail(account.email, code)).rejects.toMatchObject({
        status: 400,
      });
    });
    it('invalidates the previous challenge across independently instantiated request sessions', async () => {
      const first = await otp.issue(account);
      const oldCode = codeAt(0);
      const second = await otp.issue(account);
      expect(second.token).toBe(first.token);
      expect(second.challengeId).not.toBe(first.challengeId);
      await expect(
        otp.verify(first.token, first.challengeId, oldCode),
      ).rejects.toMatchObject({ status: 400 });
      await otp.verifyEmail(account.email, codeAt(1));
      expect(updated).toHaveBeenCalledTimes(1);
    });
    it('rejects the correct code at the expiry boundary even before Redis removes the key', async () => {
      await otp.issue(account);
      await expireRecord();
      await expect(
        otp.verifyEmail(account.email, codeAt(0)),
      ).rejects.toMatchObject({ status: 400 });
      expect(updated).not.toHaveBeenCalled();
    });
    it('allows only one successful verification under concurrent requests', async () => {
      await otp.issue(account);
      const code = codeAt(0);
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => otp.verifyEmail(account.email, code)),
      );
      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(1);
      expect(updated).toHaveBeenCalledTimes(1);
    });
    it('exhausts a challenge after five wrong guesses and rejects the correct code afterward', async () => {
      await otp.issue(account);
      const code = codeAt(0);
      const wrong = code === '000000' ? '111111' : '000000';
      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(
          otp.verifyEmail(account.email, wrong),
        ).rejects.toMatchObject({ status: 400 });
      }
      await expect(otp.verifyEmail(account.email, code)).rejects.toMatchObject({
        status: 400,
      });
      expect(updated).not.toHaveBeenCalled();
    });
    it('rejects account changes before activation', async () => {
      await otp.issue(account);
      accountStatus = 'SUSPENDED';
      await expect(
        otp.verifyEmail(account.email, codeAt(0)),
      ).rejects.toMatchObject({ status: 400 });
      expect(updated).not.toHaveBeenCalled();
    });
    it('does not make a consumed code reusable when the database write fails', async () => {
      await otp.issue(account);
      transactionFailure = true;
      await expect(
        otp.verifyEmail(account.email, codeAt(0)),
      ).rejects.toMatchObject({ status: 503 });
      transactionFailure = false;
      await expect(
        otp.verifyEmail(account.email, codeAt(0)),
      ).rejects.toMatchObject({ status: 400 });
      expect(updated).not.toHaveBeenCalled();
    });
  },
);
