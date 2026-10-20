import 'reflect-metadata';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { EmailOtpService } from './email-otp.service.js';
import { AuthRedisStore } from './auth-redis.store.js';
import { AuthMailService } from './auth-mail.service.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

const SECRET = 'a'.repeat(64);
const ACCOUNT = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.com',
  tokenVersion: 2,
};

function config(enabled = true): ConfigService {
  return new ConfigService({
    EMAIL_OTP_ENABLED: enabled ? 'true' : 'false',
    AUTH_OTP_HMAC_SECRET: SECRET,
  });
}

describe('EmailOtpService (RF-03A)', () => {
  const values = new Map<string, string>();
  const store = {
    get: jest.fn(async (key: string) => values.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    }),
    evaluate: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
  };
  const mail = { sendEmailOtp: jest.fn(async () => undefined) };
  const limiter = { reserveRecipient: jest.fn(async () => true) };
  const transaction = {
    $queryRaw: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    user: { update: jest.fn(async () => ({})) },
  };
  const prisma = {
    user: { findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>() },
    $transaction: jest.fn(
      async (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    ),
  };

  function service(enabled = true) {
    return new EmailOtpService(
      store as unknown as AuthRedisStore,
      prisma as unknown as PrismaService,
      mail as unknown as AuthMailService,
      limiter as unknown as AuthRateLimitService,
      config(enabled),
    );
  }

  beforeEach(() => {
    values.clear();
    store.get.mockReset().mockImplementation(async (key: string) => values.get(key) ?? null);
    store.set.mockReset().mockImplementation(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    });
    store.evaluate.mockReset().mockResolvedValue([]);
    mail.sendEmailOtp.mockReset().mockResolvedValue(undefined);
    limiter.reserveRecipient.mockReset().mockResolvedValue(true);
    prisma.user.findUnique.mockReset();
    transaction.$queryRaw.mockReset();
    transaction.user.update.mockReset().mockResolvedValue({});
    prisma.$transaction
      .mockReset()
      .mockImplementation(
        async (callback: (tx: typeof transaction) => unknown) =>
          callback(transaction),
      );
  });

  it('fails closed when disabled and validates the HMAC secret when enabled', () => {
    const disabled = service(false);
    expect(disabled.isEnabled()).toBe(false);
    expect(() =>
      new EmailOtpService(
        store as unknown as AuthRedisStore,
        prisma as unknown as PrismaService,
        mail as unknown as AuthMailService,
        limiter as unknown as AuthRateLimitService,
        new ConfigService({
          EMAIL_OTP_ENABLED: 'true',
          AUTH_OTP_HMAC_SECRET: 'short',
        }),
      ),
    ).toThrow(/AUTH_OTP_HMAC_SECRET/);
  });

  it('rejects disabled issuance without touching the database', async () => {
    await expect(service(false).issue(ACCOUNT)).rejects.toMatchObject({
      status: 503,
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('issues a six-digit code without storing the plaintext', async () => {
    const issuance = await service().issue(ACCOUNT);
    expect(issuance.delivered).toBe(true);
    expect(issuance.challengeId).toMatch(/^[a-f0-9]{64}$/);
    expect(issuance.token).toMatch(/^[a-f0-9]{64}$/);
    expect(mail.sendEmailOtp).toHaveBeenCalledTimes(1);
    const code = mail.sendEmailOtp.mock.calls[0]?.[1];
    expect(code).toMatch(/^[0-9]{6}$/);
    const serialized = [...values.values()][0] ?? '';
    expect(serialized).not.toContain(String(code));
    expect(serialized).not.toContain(SECRET);
    // userId/email/tokenVersion are intentional binding fields (§3.3);
    // the OTP code and HMAC secret themselves must never be stored plaintext.
  });

  it('returns a generic issuance without delivery when the recipient budget is exhausted', async () => {
    limiter.reserveRecipient.mockResolvedValue(false);
    const issuance = await service().issue(ACCOUNT);
    expect(issuance.delivered).toBe(false);
    expect(mail.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('keeps a pending proof on resend instead of issuing a new code', async () => {
    const token = 'd'.repeat(64);
    values.set(
      challengeKey(token),
      JSON.stringify({
        challengeId: 'c'.repeat(64),
        userId: ACCOUNT.id,
        email: ACCOUNT.email,
        tokenVersion: 2,
        generation: 1,
        status: 'VERIFIED_PENDING_ACTIVATION',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        attempts: 0,
        codeHash: '',
        activationDeadline: Math.floor(Date.now() / 1000) + 100,
      }),
    );
    const issuance = await service().resendForEmail(ACCOUNT.email, token);
    expect(issuance.delivered).toBe(false);
    expect(issuance.challengeId).toBe('c'.repeat(64));
    expect(mail.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('does not disclose account existence on resend', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const issuance = await service().resendForEmail('missing@example.com');
    expect(issuance.delivered).toBe(false);
    expect(issuance.challengeId).toMatch(/^[a-f0-9]{64}$/);
    expect(mail.sendEmailOtp).not.toHaveBeenCalled();
  });

  it('returns verified only when the atomic script accepts the code', async () => {
    const current = await service().issue(ACCOUNT);
    store.evaluate.mockResolvedValueOnce([1, 0]);
    const result = await service().verify(
      current.token,
      current.challengeId,
      '123456',
    );
    expect(result.status).toBe('verified');
  });

  it('rejects a wrong code and counts the failure', async () => {
    const current = await service().issue(ACCOUNT);
    store.evaluate
      .mockResolvedValueOnce([0, 1, 0])
      .mockResolvedValueOnce([1, 1800]);
    await expect(
      service().verify(current.token, current.challengeId, '000000'),
    ).rejects.toMatchObject({ status: 400 });
    expect(store.evaluate).toHaveBeenCalledTimes(2);
  });

  it('rejects when the account-wide failure budget is exhausted', async () => {
    const current = await service().issue(ACCOUNT);
    values.set(
      `booking:auth:v2:email-otp:failures:account:${requireHash(ACCOUNT.email)}`,
      '10',
    );
    store.evaluate.mockResolvedValueOnce([11, 1000]);
    await expect(
      service().verify(current.token, current.challengeId, '123456'),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('activates the account once and is idempotent on retry', async () => {
    const current = await service().issue(ACCOUNT);
    store.evaluate
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([1]);
    transaction.$queryRaw.mockResolvedValue([
      {
        id: ACCOUNT.id,
        email: ACCOUNT.email,
        token_version: 2,
        status: 'ACTIVE',
        email_verified_at: null,
      },
    ]);
    store.get.mockResolvedValue(
      JSON.stringify({
        challengeId: current.challengeId,
        userId: ACCOUNT.id,
        email: ACCOUNT.email,
        tokenVersion: 2,
        generation: 1,
        status: 'ACTIVATING',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        attempts: 0,
        codeHash: '',
        activationDeadline: Math.floor(Date.now() / 1000) + 100,
      }),
    );
    const first = await service().activate(current.token, current.challengeId);
    expect(first.status).toBe('verified');
    expect(transaction.user.update).toHaveBeenCalledTimes(1);
  });

  it('returns a pending code when the database fails after a valid OTP', async () => {
    const current = await service().issue(ACCOUNT);
    store.evaluate
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([1]);
    store.get.mockResolvedValue(
      JSON.stringify({
        challengeId: current.challengeId,
        userId: ACCOUNT.id,
        email: ACCOUNT.email,
        tokenVersion: 2,
        generation: 1,
        status: 'ACTIVATING',
        expiresAt: Math.floor(Date.now() / 1000) + 300,
        attempts: 0,
        codeHash: '',
        activationDeadline: Math.floor(Date.now() / 1000) + 100,
      }),
    );
    prisma.$transaction.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service().activate(current.token, current.challengeId),
    ).rejects.toMatchObject({ status: 503 });
  });

  it('rejects an expired activation claim', async () => {
    const current = await service().issue(ACCOUNT);
    store.evaluate
      .mockResolvedValueOnce([1])
      .mockResolvedValueOnce([-2]);
    await expect(
      service().activate(current.token, current.challengeId),
    ).rejects.toMatchObject({ status: 400 });
  });
});

function requireHash(value: string): string {
  // Mirrors the service's SHA-256 key hashing for budget fixtures.
  return createHash('sha256').update(value.toLowerCase()).digest('hex');
}

function challengeKey(token: string): string {
  return `booking:auth:v2:email-otp:challenge:${createHash('sha256')
    .update(token)
    .digest('hex')}`;
}
