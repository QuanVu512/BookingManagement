import { describe, expect, it } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { AUTH_DEV_JWT_SECRET } from '../constants/auth-validation.constants.js';
import { resolveJwtSecret } from './auth-config.js';
import { JwtStrategy } from '../strategies/jwt.strategy.js';

describe('JWT secret configuration', () => {
  it.each([
    undefined,
    '',
    '   ',
    AUTH_DEV_JWT_SECRET,
    ` ${AUTH_DEV_JWT_SECRET} `,
  ])('rejects an unsafe production secret: %s', (secret) => {
    const config = new ConfigService({
      NODE_ENV: 'production',
      JWT_SECRET: secret,
    });
    expect(() => resolveJwtSecret(config)).toThrow('JWT_SECRET');
    expect(() => new JwtStrategy(config)).toThrow('JWT_SECRET');
  });

  it('uses the configured secret for production signing and verification', () => {
    const config = new ConfigService({
      NODE_ENV: 'production',
      JWT_SECRET: 'test-only-configured-secret',
    });
    expect(resolveJwtSecret(config)).toBe('test-only-configured-secret');
    expect(() => new JwtStrategy(config)).not.toThrow();
  });

  it('keeps the fallback available for local development', () => {
    expect(
      resolveJwtSecret(new ConfigService({ NODE_ENV: 'development' })),
    ).toBe(AUTH_DEV_JWT_SECRET);
  });
});
