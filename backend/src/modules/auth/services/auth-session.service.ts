import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { Role, UserStatus } from '../../../enums/index.js';
import { AUTH_REDIS_NAMESPACE } from '../constants/auth-validation.constants.js';
import { AuthRedisStore } from './auth-redis.store.js';

export interface AuthTokenPayload {
  sub: string;
  jti: string;
  tokenVersion: number;
  exp: number;
}

export interface AuthenticatedAccount {
  userId: string;
  username: string;
  roles: Role[];
  jti: string;
  exp: number;
  tokenVersion: number;
}

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly store: AuthRedisStore,
    private readonly prisma: PrismaService,
  ) {}

  claims(userId: string, tokenVersion: number) {
    return { sub: userId, tokenVersion, jti: randomUUID() };
  }

  async authenticate(payload: unknown): Promise<AuthenticatedAccount> {
    if (
      !isAuthTokenPayload(payload) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    )
      throw new UnauthorizedException();
    if (await this.store.get(this.revokedKey(payload.jti)))
      throw new UnauthorizedException();
    const user = await this.currentAccount(payload.sub);
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.tokenVersion !== payload.tokenVersion
    )
      throw new UnauthorizedException();
    return {
      userId: user.id,
      username: user.username,
      roles: user.roles.map((assignment) => assignment.role),
      jti: payload.jti,
      exp: payload.exp,
      tokenVersion: user.tokenVersion,
    };
  }

  async revoke(account: AuthenticatedAccount): Promise<void> {
    const remainingSeconds = account.exp - Math.floor(Date.now() / 1000);
    if (remainingSeconds <= 0) throw new UnauthorizedException();
    await this.store.set(
      this.revokedKey(account.jti),
      'revoked',
      remainingSeconds,
    );
  }

  private async currentAccount(userId: string) {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        include: { roles: true },
      });
    } catch {
      throw new ServiceUnavailableException(
        'Dịch vụ xác thực tạm thời không khả dụng.',
      );
    }
  }

  private revokedKey(jti: string): string {
    return `${AUTH_REDIS_NAMESPACE}:revoked:${jti}`;
  }
}

function isAuthTokenPayload(value: unknown): value is AuthTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  return (
    'sub' in value &&
    typeof value.sub === 'string' &&
    value.sub.length > 0 &&
    'jti' in value &&
    typeof value.jti === 'string' &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value.jti,
    ) &&
    'tokenVersion' in value &&
    typeof value.tokenVersion === 'number' &&
    Number.isSafeInteger(value.tokenVersion) &&
    value.tokenVersion >= 0 &&
    'exp' in value &&
    typeof value.exp === 'number' &&
    Number.isSafeInteger(value.exp)
  );
}
