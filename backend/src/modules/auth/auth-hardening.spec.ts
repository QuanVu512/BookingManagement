import 'reflect-metadata';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { HttpException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import argon from 'argon2';
import { ArgonPasswordHasher } from './infrastructure/argon-password-hasher.js';
import { LoggingSecurityAudit } from './infrastructure/logging-security-audit.js';
import {
  AUTH_DUMMY_PASSWORD_HASH,
  AUTH_HASH_CONCURRENCY,
} from './constants/auth-validation.constants.js';
import { resolveWebOrigin } from './helpers/auth-config.js';
import { AuthController } from './auth.controller.js';
import { AUTH_RATE_POLICY } from './decorators/auth-rate-policy.decorator.js';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { resolvePublicApiOrigin } from '../../../../frontend/constants/public-origin.mjs';

afterEach(() => jest.restoreAllMocks());

describe('Auth hardening contracts', () => {
  it('uses a valid precomputed dummy Argon2id hash', async () => {
    expect(
      await argon.verify(
        AUTH_DUMMY_PASSWORD_HASH,
        'synthetic unknown password',
      ),
    ).toBe(false);
    expect(AUTH_DUMMY_PASSWORD_HASH).toContain(
      '$argon2id$v=19$m=65536,p=4,t=3$',
    );
  });

  it('bounds hash and verify together, rejects overflow without queueing, releases failures', async () => {
    const hasher = new ArgonPasswordHasher();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolveGate) => {
      release = resolveGate;
    });
    const hash = jest.spyOn(argon, 'hash').mockImplementation(async () => {
      await gate;
      return 'hash';
    });
    const tasks = Array.from({ length: AUTH_HASH_CONCURRENCY }, () =>
      hasher.hash('synthetic password'),
    );
    await expect(
      hasher.verify(AUTH_DUMMY_PASSWORD_HASH, 'password'),
    ).rejects.toBeInstanceOf(HttpException);
    expect(hash).toHaveBeenCalledTimes(AUTH_HASH_CONCURRENCY);
    release();
    await Promise.all(tasks);
    hash.mockRejectedValueOnce(new Error('synthetic failure'));
    await expect(hasher.hash('password')).rejects.toThrow('synthetic failure');
    await expect(hasher.hash('password')).resolves.toBe('hash');
  });

  it.each([
    'http://app.example.com',
    'http://localhost:4001',
    'ftp://example.com',
  ])('rejects unsafe production origin %s', (WEB_ORIGIN) => {
    expect(() =>
      resolveWebOrigin(
        new ConfigService({ NODE_ENV: 'production', WEB_ORIGIN }),
      ),
    ).toThrow();
  });

  it('allows HTTPS production and loopback HTTP development only', () => {
    expect(
      resolveWebOrigin(
        new ConfigService({
          NODE_ENV: 'production',
          WEB_ORIGIN: 'https://app.example.com',
        }),
      ),
    ).toBe('https://app.example.com');
    expect(
      resolveWebOrigin(
        new ConfigService({
          NODE_ENV: 'test',
          WEB_ORIGIN: 'http://localhost:4001',
        }),
      ),
    ).toBe('http://localhost:4001');
    expect(() =>
      resolveWebOrigin(
        new ConfigService({ WEB_ORIGIN: 'http://public.example.com' }),
      ),
    ).toThrow();
  });
  it('fails frontend production configuration closed and permits only loopback HTTP in development', () => {
    for (const value of [
      undefined,
      'http://localhost:4000',
      'https://user:pass@example.com',
      'https://api.example.com/path',
    ]) {
      expect(() => resolvePublicApiOrigin(value, true)).toThrow();
    }
    expect(resolvePublicApiOrigin('https://api.example.com', true)).toBe(
      'https://api.example.com',
    );
    expect(resolvePublicApiOrigin(undefined, false)).toBe(
      'http://localhost:4000',
    );
    expect(() =>
      resolvePublicApiOrigin('http://api.example.com', false),
    ).toThrow();
  });

  it('declares rate policy independently of handler names for all expensive public mutations', () => {
    const reflector = new Reflector();
    for (const [method, policy] of [
      ['login', 'login'],
      ['register', 'register'],
      ['verifyEmail', 'token'],
      ['resetPassword', 'token'],
      ['forgotPassword', 'recovery'],
      ['resendVerification', 'recovery'],
    ] as const)
      expect(
        reflector.get(AUTH_RATE_POLICY, AuthController.prototype[method]),
      ).toBe(policy);
  });

  it('requires review of every added auth route and keeps session routes JWT-protected', () => {
    const reflector = new Reflector();
    const routes = Object.getOwnPropertyNames(AuthController.prototype).filter(
      (name) => {
        const handler: unknown = Object.getOwnPropertyDescriptor(
          AuthController.prototype,
          name,
        )?.value;
        return (
          typeof handler === 'function' &&
          reflector.get(METHOD_METADATA, handler) !== undefined
        );
      },
    );
    expect(routes.sort()).toEqual(
      [
        'csrfToken',
        'forgotPassword',
        'getMe',
        'login',
        'logout',
        'register',
        'resendVerification',
        'resetPassword',
        'verifyEmail',
      ].sort(),
    );
    for (const method of ['getMe', 'logout'] as const)
      expect(
        reflector.get(GUARDS_METADATA, AuthController.prototype[method]),
      ).toContain(JwtAuthGuard);
  });

  it('allowlists audit fields, rejects injected identifiers and survives sink errors', () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const audit = new LoggingSecurityAudit();
    const event = {
      action: 'login',
      outcome: 'denied',
      requestId: '10000000-0000-4000-8000-000000000001',
      password: 'SYNTHETIC_SECRET_MARKER',
      email: 'private@example.com',
    } as const;
    audit.record(event);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /SYNTHETIC_SECRET_MARKER|private@example.com/,
    );
    audit.record({ ...event, requestId: 'SYNTHETIC_SECRET_MARKER' });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockImplementation(() => {
      throw new Error('SYNTHETIC_SECRET_MARKER');
    });
    expect(() => audit.record(event)).not.toThrow();
    expect(audit.snapshot().writeFailures).toBe(1);
  });

  it('keeps application/ports and auth facade free from infrastructure SDK imports', () => {
    const root = resolve('backend/src/modules/auth');
    const files = [
      'auth.service.ts',
      ...['application', 'ports'].flatMap((folder) =>
        readdirSync(resolve(root, folder)).map((name) => `${folder}/${name}`),
      ),
    ];
    for (const file of files) {
      const source = readFileSync(resolve(root, file), 'utf8');
      expect(source).not.toMatch(
        /from ['"](?:express|argon2|redis|nodemailer|@nestjs\/jwt|.*generated\/prisma|.*infrastructure\/)/,
      );
    }
  });
});
