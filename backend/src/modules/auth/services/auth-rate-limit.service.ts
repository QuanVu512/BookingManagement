import {
  Injectable,
  Optional,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthRedisStore } from './auth-redis.store.js';
import {
  AUTH_ERROR_CODES,
  AUTH_REDIS_NAMESPACE,
  AUTH_RATE_LIMITS,
} from '../constants/auth-validation.constants.js';
import { authError } from '../helpers/auth-error.js';
import { normalizeVietnamPhone } from '../helpers/auth-normalization.js';
import type { AuthRatePolicy } from '../decorators/auth-rate-policy.decorator.js';
import { AUTH_RECIPIENT_LIMIT } from '../constants/auth-validation.constants.js';

export const AUTH_RECIPIENT_SCRIPT = `
local now = tonumber(redis.call('TIME')[1])
local count = tonumber(redis.call('HGET', KEYS[1], 'count') or '0')
local last = tonumber(redis.call('HGET', KEYS[1], 'last') or '0')
if count >= tonumber(ARGV[1]) or now - last < tonumber(ARGV[3]) then return 0 end
redis.call('HSET', KEYS[1], 'count', count + 1, 'last', now)
if count == 0 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return 1
`;

export const AUTH_RATE_COUNTER_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

@Injectable()
export class AuthRateLimitService {
  private readonly mailLimit: number;
  constructor(
    private readonly store: AuthRedisStore,
    @Optional() config?: ConfigService,
  ) {
    const configured = config?.get<string>('AUTH_MAIL_MAX_PER_HOUR');
    this.mailLimit = Number(
      configured ??
        (config?.get<string>('NODE_ENV') === 'production' ? NaN : 60),
    );
    if (!Number.isSafeInteger(this.mailLimit) || this.mailLimit < 1)
      throw new Error(
        'AUTH_MAIL_MAX_PER_HOUR must be a positive provider-approved quota in production.',
      );
  }

  async check(
    kind: AuthRatePolicy,
    request: Request,
    response: Response,
  ): Promise<void> {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const ipRule = AUTH_RATE_LIMITS[`${kind}Ip`];
    const waits = [await this.increment(`${kind}:ip:${this.hash(ip)}`, ipRule)];
    const identifier = this.loginIdentifier(request.body);
    if (kind === 'login' && identifier !== null) {
      waits.push(
        await this.increment(
          `login:identifier:${this.hash(identifier)}`,
          AUTH_RATE_LIMITS.loginIdentifier,
        ),
      );
    }
    this.rejectThrottled(Math.max(...waits), response);
  }

  private rejectThrottled(retryAfter: number, response: Response): void {
    if (retryAfter > 0) {
      response.setHeader('Retry-After', retryAfter);
      throw authError(
        429,
        AUTH_ERROR_CODES.authRateLimited,
        'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.',
      );
    }
  }

  async reserveRecipient(email: string, purpose: string): Promise<boolean> {
    const result = await this.store.evaluate(
      AUTH_RECIPIENT_SCRIPT,
      `${AUTH_REDIS_NAMESPACE}:recipient:${purpose}:${this.hash(email.trim().toLowerCase())}`,
      [
        String(AUTH_RECIPIENT_LIMIT.limit),
        String(AUTH_RECIPIENT_LIMIT.seconds),
        String(AUTH_RECIPIENT_LIMIT.cooldown),
      ],
    );
    if (result !== 0 && result !== 1)
      throw authError(
        503,
        AUTH_ERROR_CODES.authUnavailable,
        'Dịch vụ xác thực tạm thời không khả dụng.',
      );
    if (result === 0) return false;
    return (
      (await this.increment('mail:global', {
        limit: this.mailLimit,
        seconds: AUTH_RECIPIENT_LIMIT.seconds,
      })) === 0
    );
  }

  private loginIdentifier(body: unknown): string | null {
    if (
      typeof body !== 'object' ||
      body === null ||
      !('username' in body) ||
      typeof body.username !== 'string'
    )
      return null;
    return (
      normalizeVietnamPhone(body.username) ?? body.username.trim().toLowerCase()
    );
  }

  private async increment(
    key: string,
    rule: { limit: number; seconds: number },
  ): Promise<number> {
    const result = await this.store.evaluate(
      AUTH_RATE_COUNTER_SCRIPT,
      `${AUTH_REDIS_NAMESPACE}:rate:${key}`,
      [String(rule.seconds)],
    );
    if (
      !Array.isArray(result) ||
      result.length !== 2 ||
      !result.every(
        (value) =>
          typeof value === 'number' && Number.isInteger(value) && value >= 0,
      )
    ) {
      throw authError(
        503,
        AUTH_ERROR_CODES.authUnavailable,
        'Dịch vụ xác thực tạm thời không khả dụng.',
      );
    }
    return result[0] > rule.limit ? Math.max(1, result[1]) : 0;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
