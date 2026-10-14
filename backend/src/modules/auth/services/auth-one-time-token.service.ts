import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  AUTH_RANDOM_TOKEN_BYTES,
  AUTH_RANDOM_TOKEN_PATTERN,
  AUTH_REDIS_NAMESPACE,
  AUTH_ONE_TIME_TTLS,
} from '../constants/auth-validation.constants.js';
import { AuthRedisStore } from './auth-redis.store.js';
import type { AuthTokenPurpose } from './auth-mail.service.js';

export type AuthTokenAccount = {
  id: string;
  email: string;
  tokenVersion: number;
};

@Injectable()
export class AuthOneTimeTokenService {
  constructor(private readonly store: AuthRedisStore) {}

  async issue(
    purpose: AuthTokenPurpose,
    account: AuthTokenAccount,
  ): Promise<string> {
    const token = randomBytes(AUTH_RANDOM_TOKEN_BYTES).toString('hex');
    await this.store.set(
      this.key(purpose, token),
      JSON.stringify(account),
      AUTH_ONE_TIME_TTLS[purpose],
    );
    return token;
  }

  async read(
    purpose: AuthTokenPurpose,
    token: string,
  ): Promise<AuthTokenAccount> {
    return this.parse(await this.store.get(this.key(purpose, token)));
  }

  async consume(
    purpose: AuthTokenPurpose,
    token: string,
  ): Promise<AuthTokenAccount> {
    return this.parse(await this.store.consume(this.key(purpose, token)));
  }

  private key(purpose: AuthTokenPurpose, token: string): string {
    if (!AUTH_RANDOM_TOKEN_PATTERN.test(token)) throw this.invalid();
    return `${AUTH_REDIS_NAMESPACE}:token:${purpose}:${createHash('sha256').update(token).digest('hex')}`;
  }

  private parse(serialized: string | null): AuthTokenAccount {
    if (!serialized) throw this.invalid();
    try {
      const value: unknown = JSON.parse(serialized);
      if (
        typeof value === 'object' &&
        value !== null &&
        'id' in value &&
        typeof value.id === 'string' &&
        'email' in value &&
        typeof value.email === 'string' &&
        'tokenVersion' in value &&
        typeof value.tokenVersion === 'number' &&
        Number.isInteger(value.tokenVersion) &&
        value.tokenVersion >= 0
      )
        return {
          id: value.id,
          email: value.email,
          tokenVersion: value.tokenVersion,
        };
    } catch {
      /* Invalid storage content is rejected without revealing it. */
    }
    throw this.invalid();
  }

  private invalid(): BadRequestException {
    return new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn.');
  }
}
