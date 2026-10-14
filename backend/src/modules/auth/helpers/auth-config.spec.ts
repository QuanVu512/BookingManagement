import { describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import {
  authJwtOptions,
  resolveJwtSecret,
  resolveTrustedProxy,
} from './auth-config.js';

const TEST_SECRET =
  '21d36eeec4567a8b969e3b012c703672b753fbcba854d3a05163b64b19e40a79';

describe('Trusted proxy configuration', () => {
  it('trusts no proxy by default', () =>
    expect(resolveTrustedProxy(new ConfigService({}))).toBe(false));
  it('accepts explicit addresses and CIDR networks', () =>
    expect(
      resolveTrustedProxy(
        new ConfigService({ TRUSTED_PROXY: '127.0.0.1,10.0.0.0/24,::1' }),
      ),
    ).toEqual(['127.0.0.1', '10.0.0.0/24', '::1']));
  it.each([
    'true',
    '1',
    '0.0.0.0/0',
    '::/0',
    '10.0.0.0/99',
    'localhost',
    '127.0.0.1,',
  ])('rejects unsafe or malformed proxy settings: %s', (value) =>
    expect(() =>
      resolveTrustedProxy(new ConfigService({ TRUSTED_PROXY: value })),
    ).toThrow('TRUSTED_PROXY'),
  );
});

describe('JWT secret configuration', () => {
  it.each([
    undefined,
    'dev-secret-key-change-in-production-12345',
    'f'.repeat(64),
  ])('fails JWT module startup for invalid secret: %s', async (secret) => {
    await expect(
      Test.createTestingModule({
        imports: [
          JwtModule.registerAsync({
            useFactory: () =>
              authJwtOptions(new ConfigService({ JWT_SECRET: secret })),
          }),
        ],
      }).compile(),
    ).rejects.toThrow('JWT_SECRET');
  });
  it('starts a JWT module with an explicit test secret and enforces a 15-minute token lifetime', async () => {
    const module = await Test.createTestingModule({
      imports: [
        JwtModule.registerAsync({
          useFactory: () =>
            authJwtOptions(new ConfigService({ JWT_SECRET: TEST_SECRET })),
        }),
      ],
    }).compile();
    const jwt = module.get(JwtService);
    const token = await jwt.signAsync({ sub: 'test-account' });
    const payload = await jwt.verifyAsync<{ iat: number; exp: number }>(token);
    expect(payload.exp - payload.iat).toBe(900);
    await module.close();
  });
  it.each([
    undefined,
    '',
    '   ',
    'dev-secret-key-change-in-production-12345',
    'replace-with-your-own-random-64-hex-character-secret',
    'short',
    'f'.repeat(64),
    'g'.repeat(64),
    '0123456789abcdef'.repeat(4),
  ])(
    'rejects missing, placeholder or weak configuration in every environment: %s',
    (secret) => {
      for (const environment of [
        'development',
        'test',
        'production',
        undefined,
      ]) {
        const config = new ConfigService({
          NODE_ENV: environment,
          JWT_SECRET: secret,
        });
        expect(() => resolveJwtSecret(config)).toThrow('JWT_SECRET');
        expect(() => authJwtOptions(config)).toThrow('JWT_SECRET');
      }
    },
  );

  it('uses the configured secret for production signing and verification', () => {
    const config = new ConfigService({
      NODE_ENV: 'production',
      JWT_SECRET: ` ${TEST_SECRET} `,
    });
    expect(resolveJwtSecret(config)).toBe(TEST_SECRET);
    expect(authJwtOptions(config)).toEqual({
      secret: TEST_SECRET,
      signOptions: { expiresIn: '15m' },
    });
  });

  it.each(['development', 'test', 'production'])(
    'uses only an explicit secret in %s',
    (environment) => {
      expect(
        resolveJwtSecret(
          new ConfigService({ NODE_ENV: environment, JWT_SECRET: TEST_SECRET }),
        ),
      ).toBe(TEST_SECRET);
    },
  );
});
