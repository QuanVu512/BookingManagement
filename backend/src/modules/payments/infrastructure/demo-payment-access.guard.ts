import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { AuthCsrfGuard } from '../../auth/guards/auth-csrf.guard.js';
import { GuestTokenGuard, GUEST_TOKEN_HEADER } from './guest-token.guard.js';

/** Token guest không được fallback sang cookie khi token sai. */
@Injectable()
export class DemoPaymentAccessGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtAuthGuard,
    private readonly csrf: AuthCsrfGuard,
    private readonly guest: GuestTokenGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.header(GUEST_TOKEN_HEADER) !== undefined) {
      return this.guest.canActivate(context);
    }
    if (!(await this.jwt.canActivate(context))) return false;
    return this.csrf.canActivate(context);
  }
}
