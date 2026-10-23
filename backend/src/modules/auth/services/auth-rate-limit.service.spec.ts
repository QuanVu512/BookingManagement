import { AUTH_RATE_LIMITS } from '../constants/auth-validation.constants.js';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { AuthRedisStore } from './auth-redis.store.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';

describe('Auth rate limits', () => {
  let service: AuthRateLimitService;
  let now: number;
  const counters = new Map<string, { count: number; expires: number }>();
  const evaluate =
    jest.fn<
      (script: string, key: string, args: string[]) => Promise<unknown>
    >();
  const response = { setHeader: jest.fn() };
  const request = (ip: string, username = 'Customer@Example.com') =>
    ({ ip, body: { username } }) as Request;
  beforeEach(async () => {
    counters.clear();
    now = 0;
    response.setHeader.mockClear();
    evaluate.mockReset().mockImplementation(async (_script, key, args) => {
      const prior = counters.get(key);
      const entry =
        prior && prior.expires > now
          ? prior
          : { count: 0, expires: now + Number(args[0]) };
      entry.count++;
      counters.set(key, entry);
      return [entry.count, entry.expires - now];
    });
    service = (
      await Test.createTestingModule({
        providers: [
          AuthRateLimitService,
          { provide: AuthRedisStore, useValue: { evaluate } },
        ],
      }).compile()
    ).get(AuthRateLimitService);
  });
  it('limits an identifier across IPs, normalizes email and allows retry after TTL', async () => {
    for (let index = 0; index < AUTH_RATE_LIMITS.loginIdentifier.limit; index++)
      await service.check(
        'login',
        request(`ip-${index}`),
        response as unknown as Response,
      );
    await expect(
      service.check(
        'login',
        request('new-ip', ' customer@example.com '),
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', 300);
    expect([...counters.keys()].join()).not.toContain('customer@example.com');
    now = 301;
    await expect(
      service.check(
        'login',
        request('new-ip'),
        response as unknown as Response,
      ),
    ).resolves.toBeUndefined();
  });
  it('limits login IP independently of identifier', async () => {
    for (let index = 0; index < AUTH_RATE_LIMITS.loginIp.limit; index++)
      await service.check(
        'login',
        request('same-ip', `user${index}`),
        response as unknown as Response,
      );
    await expect(
      service.check(
        'login',
        request('same-ip', 'other-user'),
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.check(
        'login',
        request('other-ip', 'other-user'),
        response as unknown as Response,
      ),
    ).resolves.toBeUndefined();
  });
  it('limits register IP without mixing login counters', async () => {
    for (let index = 0; index < AUTH_RATE_LIMITS.registerIp.limit; index++)
      await service.check(
        'register',
        request('same-ip'),
        response as unknown as Response,
      );
    await expect(
      service.check(
        'register',
        request('same-ip'),
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(HttpException);
    await expect(
      service.check(
        'register',
        request('different-ip'),
        response as unknown as Response,
      ),
    ).resolves.toBeUndefined();
    await expect(
      service.check(
        'login',
        request('same-ip'),
        response as unknown as Response,
      ),
    ).resolves.toBeUndefined();
  });
  it('normalizes equivalent phone identifiers', async () => {
    for (let index = 0; index < 5; index++)
      await service.check(
        'login',
        request(`ip-${index}`, '0912345678'),
        response as unknown as Response,
      );
    await expect(
      service.check(
        'login',
        request('sixth-ip', '+84912345678'),
        response as unknown as Response,
      ),
    ).rejects.toBeInstanceOf(HttpException);
  });
  it('fails closed on Redis error and invalid counter response', async () => {
    evaluate.mockRejectedValueOnce(new ServiceUnavailableException());
    await expect(
      service.check('login', request('ip'), response as unknown as Response),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    evaluate.mockResolvedValueOnce(null);
    await expect(
      service.check('login', request('ip'), response as unknown as Response),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
  it('uses a ten-second cooldown for OTP and keeps the recovery cooldown', async () => {
    evaluate.mockResolvedValue(0);
    await service.reserveRecipient('customer@example.com', 'email-otp');
    expect(evaluate).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      ['3', '3600', '10'],
    );
    await service.reserveRecipient('customer@example.com', 'reset-password');
    expect(evaluate).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.any(String),
      ['3', '3600', '60'],
    );
  });
  it('suppresses recipients before global quota and fails closed on malformed admission', async () => {
    evaluate.mockResolvedValueOnce(0);
    await expect(
      service.reserveRecipient(' PRIVATE@example.com ', 'reset-password'),
    ).resolves.toBe(false);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(evaluate.mock.calls)).not.toContain(
      'PRIVATE@example.com',
    );
    evaluate.mockResolvedValueOnce(1).mockResolvedValueOnce([1, 3600]);
    await expect(
      service.reserveRecipient('private@example.com', 'reset-password'),
    ).resolves.toBe(true);
    evaluate.mockResolvedValueOnce(1).mockResolvedValueOnce([61, 3600]);
    await expect(
      service.reserveRecipient('other@example.com', 'reset-password'),
    ).resolves.toBe(false);
    evaluate.mockResolvedValueOnce(null);
    await expect(
      service.reserveRecipient('other@example.com', 'reset-password'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
