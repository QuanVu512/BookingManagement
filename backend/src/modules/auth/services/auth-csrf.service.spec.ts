import 'reflect-metadata';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';
import { AuthRedisStore } from './auth-redis.store.js';
import { AuthCsrfService } from './auth-csrf.service.js';
import { AUTH_CSRF_COOKIE_NAME } from '../constants/auth-validation.constants.js';

describe('CSRF synchronizer token and source', () => {
  const entries = new Map<string, string>();
  const store = {
    get: jest.fn<(key: string) => Promise<string | null>>(),
    set: jest.fn<
      (key: string, value: string, ttl: number) => Promise<string>
    >(),
  };
  let csrf: AuthCsrfService;
  let token: string;
  let cookie: string;

  beforeEach(async () => {
    entries.clear();
    jest.clearAllMocks();
    store.get.mockImplementation(async (key) => entries.get(key) ?? null);
    store.set.mockImplementation(async (key, value) => {
      entries.set(key, value);
      return 'OK';
    });
    const module = await Test.createTestingModule({
      providers: [
        AuthCsrfService,
        {
          provide: ConfigService,
          useValue: new ConfigService({
            NODE_ENV: 'production',
            WEB_ORIGIN: 'https://web.example.test',
          }),
        },
        { provide: AuthRedisStore, useValue: store },
      ],
    }).compile();
    csrf = module.get(AuthCsrfService);
    const response = { cookie: jest.fn(), setHeader: jest.fn() };
    ({ token } = await csrf.issue(
      { headers: {} } as Request,
      response as unknown as Response,
    ));
    const contextCookie = response.cookie.mock.calls[0]?.[1];
    if (typeof contextCookie !== 'string')
      throw new Error('CSRF cookie was not issued');
    cookie = `${AUTH_CSRF_COOKIE_NAME}=${contextCookie}`;
    expect(response.cookie).toHaveBeenCalledWith(
      AUTH_CSRF_COOKIE_NAME,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        sameSite: 'none',
      }),
    );
  });

  function request(headers: Request['headers']): Request {
    return {
      headers: {
        cookie,
        origin: 'https://web.example.test',
        'x-csrf-token': token,
        ...headers,
      },
    } as Request;
  }

  it('accepts a browser-bound token and stores only hashes with bounded TTL', async () => {
    await expect(csrf.validate(request({}))).resolves.toBeUndefined();
    const [key, value, ttl] = store.set.mock.calls[0] ?? [];
    expect(key).not.toContain(token);
    expect(value).not.toBe(token);
    expect(ttl).toBe(1800);
  });

  it.each([
    { 'x-csrf-token': undefined },
    { 'x-csrf-token': 'invalid' },
    { cookie: '' },
    { cookie: `${AUTH_CSRF_COOKIE_NAME}=${'f'.repeat(64)}` },
    { origin: 'https://web.example.test.evil.test' },
    { origin: 'null' },
    { origin: 'https://evil.test', referer: 'https://web.example.test/page' },
    { origin: undefined, referer: undefined },
    { origin: undefined, referer: 'https://web.example.test@evil.test/page' },
  ])(
    'rejects missing/invalid token, cookie binding or source: %j',
    async (headers) => {
      await expect(csrf.validate(request(headers))).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );

  it('uses Referer only when Origin is absent and checks its exact origin', async () => {
    await expect(
      csrf.validate(
        request({
          origin: undefined,
          referer: 'https://web.example.test/page?query=1',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('rejects expired tokens', async () => {
    entries.clear();
    await expect(csrf.validate(request({}))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
