import { PasswordHasher } from '../ports/password-hasher.js';
import { ArgonPasswordHasher } from '../infrastructure/argon-password-hasher.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';
import {
  AUTH_ONE_TIME_TTLS,
  AUTH_RECOVERY_RESPONSE_MS,
} from '../constants/auth-validation.constants.js';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import argon from 'argon2';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { UserStatus } from '../../../enums/index.js';
import {
  AuthRecoveryService,
  AUTH_RECOVERY_MESSAGE,
} from './auth-recovery.service.js';
import { AuthOneTimeTokenService } from './auth-one-time-token.service.js';
import { AuthRedisStore } from './auth-redis.store.js';
import { AuthMailService } from './auth-mail.service.js';
import { CompromisedPasswordService } from './compromised-password.service.js';
import { EmailOtpService } from './email-otp.service.js';

describe('Email verification and recovery', () => {
  const account = {
    id: 'user-1',
    email: 'customer@example.com',
    tokenVersion: 0,
  };
  let user: {
    id: string;
    email: string;
    tokenVersion: number;
    status: UserStatus;
    emailVerifiedAt: Date | null;
  } | null;
  const entries = new Map<string, { value: string; expires: number }>();
  const sendToken = jest.fn<() => Promise<void>>();
  const assertAllowed = jest.fn<() => Promise<void>>();
  const updateMany = jest.fn<
    (query: {
      where: {
        tokenVersion: number;
        email: string;
        status: UserStatus;
        emailVerifiedAt?: null;
      };
      data: {
        passwordHash?: string;
        tokenVersion?: { increment: number };
        emailVerifiedAt?: Date;
      };
    }) => Promise<{ count: number }>
  >();
  let recovery: AuthRecoveryService;
  let tokens: AuthOneTimeTokenService;
  let hash: ReturnType<typeof jest.spyOn<typeof argon, 'hash'>>;
  beforeEach(async () => {
    jest.useFakeTimers();
    entries.clear();
    user = { ...account, status: UserStatus.ACTIVE, emailVerifiedAt: null };
    sendToken.mockReset().mockResolvedValue();
    assertAllowed.mockReset().mockResolvedValue();
    updateMany.mockReset().mockImplementation(async ({ where, data }) => {
      if (
        !user ||
        user.tokenVersion !== where.tokenVersion ||
        user.email !== where.email ||
        user.status !== where.status ||
        (where.emailVerifiedAt === null && user.emailVerifiedAt !== null)
      )
        return { count: 0 };
      if (data.emailVerifiedAt) user.emailVerifiedAt = data.emailVerifiedAt;
      if (data.tokenVersion) user.tokenVersion += data.tokenVersion.increment;
      return { count: 1 };
    });
    const get = async (key: string) => {
      const entry = entries.get(key);
      return entry && entry.expires > Date.now() ? entry.value : null;
    };
    const module = await Test.createTestingModule({
      providers: [
        AuthRecoveryService,
        {
          provide: EmailOtpService,
          useValue: {
            issue: () => sendToken(),
            resendForEmail: () => sendToken(),
          },
        },
        { provide: PasswordHasher, useClass: ArgonPasswordHasher },
        {
          provide: AuthRateLimitService,
          useValue: { reserveRecipient: async () => true },
        },
        AuthOneTimeTokenService,
        {
          provide: AuthRedisStore,
          useValue: {
            get,
            set: async (key: string, value: string, ttl: number) => {
              entries.set(key, { value, expires: Date.now() + ttl * 1000 });
            },
            consume: async (key: string) => {
              const value = await get(key);
              entries.delete(key);
              return value;
            },
          },
        },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async () => user,
              findFirst: async () => user,
              updateMany,
            },
          },
        },
        { provide: AuthMailService, useValue: { sendToken } },
        { provide: CompromisedPasswordService, useValue: { assertAllowed } },
      ],
    }).compile();
    recovery = module.get(AuthRecoveryService);
    tokens = module.get(AuthOneTimeTokenService);
    hash = jest.spyOn(argon, 'hash').mockResolvedValue('new-argon-hash');
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('binds a short-lived OTP delivery proof to its recipient and purpose', async () => {
    const proof = await recovery.prepareVerification(account);
    await expect(tokens.read('email-otp-delivery', proof)).resolves.toEqual(
      account,
    );
    await expect(tokens.read('verify-email', proof)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      recovery.sendEmailOtp({
        email: 'another@example.com',
        verificationToken: proof,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(sendToken).not.toHaveBeenCalled();
    jest.advanceTimersByTime(10 * 60 * 1000);
    await expect(
      tokens.read('email-otp-delivery', proof),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stores only a hash of a secure random token with purpose and finite TTL', async () => {
    const token = await tokens.issue('verify-email', account);
    const second = await tokens.issue('verify-email', account);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(token);
    const key = [...entries.keys()][0];
    expect(key).toContain(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify([...entries])).not.toContain(token);
    expect(entries.get(key)?.expires).toBe(
      Date.now() + AUTH_ONE_TIME_TTLS['verify-email'] * 1000,
    );
    await expect(
      tokens.consume('reset-password', token),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('verifies email once and rejects replay', async () => {
    const token = await tokens.issue('verify-email', account);
    await expect(recovery.verifyEmail({ token })).resolves.toMatchObject({
      success: true,
    });
    expect(user?.emailVerifiedAt).toBeInstanceOf(Date);
    await expect(recovery.verifyEmail({ token })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
  it.each(['verify-email', 'reset-password'] as const)(
    'rejects an expired %s token',
    async (purpose) => {
      const token = await tokens.issue(purpose, account);
      await jest.advanceTimersByTimeAsync(
        AUTH_ONE_TIME_TTLS[purpose] * 1000 + 1,
      );
      await expect(tokens.consume(purpose, token)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
  it('resets once, hashes the exact passphrase and increments session version', async () => {
    const token = await tokens.issue('reset-password', account);
    const password = '  mật khẩu dài có dấu 😀  ';
    await expect(
      recovery.resetPassword({ token, password, confirmPassword: password }),
    ).resolves.toMatchObject({ success: true });
    expect(hash).toHaveBeenCalledWith(password);
    expect(user?.tokenVersion).toBe(1);
    await expect(
      recovery.resetPassword({ token, password, confirmPassword: password }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
  it('permits at most one concurrent reset, including independently issued tokens', async () => {
    const first = await tokens.issue('reset-password', account);
    const second = await tokens.issue('reset-password', account);
    const password = 'long safe password phrase';
    const results = await Promise.allSettled(
      [first, second].map((token) =>
        recovery.resetPassword({ token, password, confirmPassword: password }),
      ),
    );
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(user?.tokenVersion).toBe(1);
  });
  it('enforces password maximum before expensive work and does not burn a token for invalid input', async () => {
    const token = await tokens.issue('reset-password', account);
    const password = 'a'.repeat(129);
    await expect(
      recovery.resetPassword({ token, password, confirmPassword: password }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hash).not.toHaveBeenCalled();
    expect(assertAllowed).not.toHaveBeenCalled();
    await expect(tokens.read('reset-password', token)).resolves.toEqual(
      account,
    );
  });
  it('rejects compromised passwords before consuming the token or writing the DB', async () => {
    const token = await tokens.issue('reset-password', account);
    const password = 'long unsafe password';
    assertAllowed.mockRejectedValueOnce(new BadRequestException());
    await expect(
      recovery.resetPassword({ token, password, confirmPassword: password }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(hash).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    await expect(tokens.read('reset-password', token)).resolves.toEqual(
      account,
    );
  });
  it('rejects verification after account disable, email change or version change', async () => {
    for (const changes of [
      { status: UserStatus.SUSPENDED },
      { email: 'changed@example.com' },
      { tokenVersion: 1 },
    ]) {
      const token = await tokens.issue('verify-email', account);
      user = {
        ...account,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: null,
        ...changes,
      };
      await expect(recovery.verifyEmail({ token })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
  it.each(['existing', 'missing', 'disabled', 'mail-failed', 'mail-stalled'])(
    'returns the same forgot response at the same deadline for %s accounts',
    async (scenario) => {
      if (scenario === 'missing') user = null;
      if (scenario === 'disabled' && user) user.status = UserStatus.CLOSED;
      if (scenario === 'mail-failed')
        sendToken.mockRejectedValueOnce(
          new Error('do not expose provider failure'),
        );
      if (scenario === 'mail-stalled')
        sendToken.mockImplementationOnce(() => new Promise(() => undefined));
      let resolved = false;
      const result = recovery
        .requestEmail({ email: account.email }, 'reset-password')
        .then((response) => {
          resolved = true;
          return response;
        });
      await jest.advanceTimersByTimeAsync(AUTH_RECOVERY_RESPONSE_MS - 1);
      expect(resolved).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(await result).toEqual({
        success: true,
        message: AUTH_RECOVERY_MESSAGE,
      });
    },
  );
  it('does not hold registration open for stalled SMTP and bounds all background deliveries', async () => {
    sendToken.mockImplementation(() => new Promise(() => undefined));
    await Promise.all(
      Array.from({ length: 20 }, () => recovery.sendVerification(account)),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(sendToken).toHaveBeenCalledTimes(4);
    await expect(recovery.sendVerification(account)).resolves.toBeUndefined();
    expect(sendToken).toHaveBeenCalledTimes(4);
  });
});
