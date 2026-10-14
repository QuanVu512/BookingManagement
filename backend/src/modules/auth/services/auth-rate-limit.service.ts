import {
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { AuthRedisStore } from './auth-redis.store.js';
import {
  AUTH_REDIS_NAMESPACE,
  AUTH_RATE_LIMITS,
} from '../constants/auth-validation.constants.js';
import { normalizeVietnamPhone } from '../helpers/auth-normalization.js';

export const AUTH_RATE_COUNTER_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {count, ttl}
`;

@Injectable()
export class AuthRateLimitService {
  constructor(private readonly store: AuthRedisStore) {}

  async check(
    kind: 'login' | 'register',
    request: Request,
    response: Response,
  ): Promise<void> {
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const ipRule =
      kind === 'login' ? AUTH_RATE_LIMITS.loginIp : AUTH_RATE_LIMITS.registerIp;
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
    const retryAfter = Math.max(...waits);
    if (retryAfter > 0) {
      response.setHeader('Retry-After', retryAfter);
      throw new HttpException(
        'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
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
      throw new ServiceUnavailableException(
        'Dịch vụ xác thực tạm thời không khả dụng.',
      );
    }
    return result[0] > rule.limit ? Math.max(1, result[1]) : 0;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
