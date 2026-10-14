import 'reflect-metadata';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthSessionService } from './auth-session.service.js';
import { AuthRedisStore } from './auth-redis.store.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { JwtStrategy } from '../strategies/jwt.strategy.js';
import { Role } from '../../../enums/index.js';
import { authJwtOptions } from '../helpers/auth-config.js';

const TEST_SECRET =
  '21d36eeec4567a8b969e3b012c703672b753fbcba854d3a05163b64b19e40a79';
const USER = {
  id: 'account-1',
  username: 'customer',
  status: 'ACTIVE',
  tokenVersion: 3,
  roles: [{ role: Role.STAFF }],
};

describe('Server-side session validation', () => {
  const entries = new Map<string, string>();
  const redis = {
    get: jest.fn<(key: string) => Promise<string | null>>(),
    set: jest.fn<
      (key: string, value: string, options: { EX: number }) => Promise<string>
    >(),
  };
  const prisma = { user: { findUnique: jest.fn<() => Promise<unknown>>() } };
  let sessions: AuthSessionService;
  let strategy: JwtStrategy;
  let jwt: JwtService;

  beforeEach(async () => {
    entries.clear();
    jest.clearAllMocks();
    redis.get.mockImplementation(async (key) => entries.get(key) ?? null);
    redis.set.mockImplementation(async (key, value) => {
      entries.set(key, value);
      return 'OK';
    });
    prisma.user.findUnique.mockReset().mockResolvedValue(USER);
    const config = new ConfigService({
      NODE_ENV: 'test',
      JWT_SECRET: TEST_SECRET,
    });
    const module = await Test.createTestingModule({
      providers: [
        AuthSessionService,
        AuthRedisStore,
        JwtStrategy,
        { provide: ConfigService, useValue: config },
        { provide: RedisService, useValue: { client: redis } },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    sessions = module.get(AuthSessionService);
    strategy = module.get(JwtStrategy);
    jwt = new JwtService(authJwtOptions(config));
  });

  it('rejects the same copied, correctly signed token after server-side logout revocation', async () => {
    const token = await jwt.signAsync(
      sessions.claims(USER.id, USER.tokenVersion),
    );
    const payload: unknown = await jwt.verifyAsync(token);
    const account = await strategy.validate(payload);
    expect(account.roles).toEqual([Role.STAFF]);
    await sessions.revoke(account);
    expect(redis.set).toHaveBeenCalledWith(
      expect.stringContaining(account.jti),
      'revoked',
      expect.objectContaining({ EX: expect.any(Number) }),
    );
    expect(redis.set.mock.calls[0]?.[2].EX).toBeGreaterThan(0);
    expect(redis.set.mock.calls[0]?.[2].EX).toBeLessThanOrEqual(900);
    await expect(
      strategy.validate(await jwt.verifyAsync(token)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('uses current roles instead of stale JWT role claims', async () => {
    const token = await jwt.signAsync({
      ...sessions.claims(USER.id, 3),
      roles: ['ADMIN'],
    });
    const payload: unknown = await jwt.verifyAsync(token);
    expect((await strategy.validate(payload)).roles).toEqual([Role.STAFF]);
    prisma.user.findUnique.mockResolvedValue({
      ...USER,
      roles: [{ role: Role.CUSTOMER }],
    });
    expect((await strategy.validate(payload)).roles).toEqual([Role.CUSTOMER]);
  });

  it.each([
    null,
    { ...USER, status: 'SUSPENDED' },
    { ...USER, status: 'CLOSED' },
    { ...USER, tokenVersion: 4 },
  ])('rejects deleted/disabled/version-changed accounts', async (user) => {
    prisma.user.findUnique.mockResolvedValue(user);
    const token = await jwt.signAsync(sessions.claims(USER.id, 3));
    await expect(
      strategy.validate(await jwt.verifyAsync(token)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired JWT and does not accept old payloads without a session id/version', async () => {
    const expired = await jwt.signAsync(sessions.claims(USER.id, 3), {
      expiresIn: -1,
    });
    await expect(jwt.verifyAsync(expired)).rejects.toThrow();
    await expect(
      strategy.validate({
        sub: USER.id,
        roles: ['ADMIN'],
        exp: Math.floor(Date.now() / 1000) + 900,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when Redis or DB is unavailable', async () => {
    const payload: unknown = await jwt.verifyAsync(
      await jwt.signAsync(sessions.claims(USER.id, 3)),
    );
    redis.get.mockRejectedValueOnce(new Error('private connection detail'));
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    prisma.user.findUnique.mockRejectedValueOnce(
      new Error('private database detail'),
    );
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
