import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import type { JwtModuleOptions } from '@nestjs/jwt';
import {
  AUTH_JWT_SECRET_PATTERN,
  AUTH_JWT_SECRET_MIN_DISTINCT_CHARACTERS,
  AUTH_TOKEN_TTL,
} from '../constants/auth-validation.constants.js';

export function resolveJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET')?.trim();
  if (
    !secret ||
    !AUTH_JWT_SECRET_PATTERN.test(secret) ||
    new Set(secret.toLowerCase()).size <
      AUTH_JWT_SECRET_MIN_DISTINCT_CHARACTERS ||
    /^(.{1,32})\1+$/i.test(secret)
  ) {
    throw new Error(
      'JWT_SECRET must be an explicit random 32-byte secret encoded as 64 hexadecimal characters.',
    );
  }
  return secret;
}

export function authJwtOptions(configService: ConfigService): JwtModuleOptions {
  return {
    secret: resolveJwtSecret(configService),
    signOptions: { expiresIn: AUTH_TOKEN_TTL },
  };
}

export function resolveWebOrigin(config: ConfigService): string {
  const configured = config.getOrThrow<string>('WEB_ORIGIN');
  const origin = new URL(configured);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('WEB_ORIGIN must be one explicit HTTP(S) origin.');
  return origin.origin;
}
export function resolveTrustedProxy(config: ConfigService): false | string[] {
  const configured = config.get<string>('TRUSTED_PROXY')?.trim();
  if (!configured) return false;
  const networks = configured.split(',').map((network) => network.trim());
  for (const network of networks) {
    const [address, prefix, extra] = network.split('/');
    const family = isIP(address);
    const maximum = family === 4 ? 32 : 128;
    if (
      !family ||
      extra !== undefined ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > maximum))
    ) {
      throw new Error(
        'TRUSTED_PROXY must contain explicit IP addresses or nonzero CIDR networks.',
      );
    }
  }
  return networks;
}
