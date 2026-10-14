import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  AUTH_CSRF_COOKIE_NAME,
  AUTH_CSRF_HEADER_NAME,
  AUTH_CSRF_TTL_SECONDS,
  AUTH_RANDOM_TOKEN_BYTES,
  AUTH_RANDOM_TOKEN_PATTERN,
  AUTH_REDIS_NAMESPACE,
} from '../constants/auth-validation.constants.js';
import { readAuthCookie, authCookieOptions } from '../helpers/auth-cookie.js';
import { resolveWebOrigin } from '../helpers/auth-config.js';
import { AuthRedisStore } from './auth-redis.store.js';

@Injectable()
export class AuthCsrfService {
  private readonly allowedOrigin: string;

  constructor(
    private readonly config: ConfigService,
    private readonly store: AuthRedisStore,
  ) {
    this.allowedOrigin = resolveWebOrigin(config);
  }

  async issue(
    request: Request,
    response: Response,
  ): Promise<{ token: string }> {
    const previous = readAuthCookie(request, AUTH_CSRF_COOKIE_NAME);
    const context =
      previous && AUTH_RANDOM_TOKEN_PATTERN.test(previous)
        ? previous
        : randomBytes(AUTH_RANDOM_TOKEN_BYTES).toString('hex');
    const token = randomBytes(AUTH_RANDOM_TOKEN_BYTES).toString('hex');
    await this.store.set(
      this.key(token),
      digest(context),
      AUTH_CSRF_TTL_SECONDS,
    );
    response.cookie(AUTH_CSRF_COOKIE_NAME, context, {
      ...authCookieOptions(this.config),
      maxAge: AUTH_CSRF_TTL_SECONDS * 1000,
    });
    response.setHeader('Cache-Control', 'no-store');
    return { token };
  }

  async validate(request: Request): Promise<void> {
    if (!this.validSource(request))
      throw new ForbiddenException('Yêu cầu xác thực không hợp lệ.');
    const token = request.headers[AUTH_CSRF_HEADER_NAME];
    const context = readAuthCookie(request, AUTH_CSRF_COOKIE_NAME);
    if (
      typeof token !== 'string' ||
      !AUTH_RANDOM_TOKEN_PATTERN.test(token) ||
      !context ||
      !AUTH_RANDOM_TOKEN_PATTERN.test(context)
    )
      throw new ForbiddenException('Yêu cầu xác thực không hợp lệ.');
    const stored = await this.store.get(this.key(token));
    const expected = digest(context);
    if (
      !stored ||
      !AUTH_RANDOM_TOKEN_PATTERN.test(stored) ||
      !timingSafeEqual(Buffer.from(stored), Buffer.from(expected))
    )
      throw new ForbiddenException('Yêu cầu xác thực không hợp lệ.');
  }

  private validSource(request: Request): boolean {
    const origin = request.headers.origin;
    if (origin !== undefined) return origin === this.allowedOrigin;
    const referer = request.headers.referer;
    if (typeof referer !== 'string') return false;
    try {
      return new URL(referer).origin === this.allowedOrigin;
    } catch {
      return false;
    }
  }

  private key(token: string): string {
    return `${AUTH_REDIS_NAMESPACE}:csrf:${digest(token)}`;
  }
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
