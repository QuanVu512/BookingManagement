import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthRateLimitService } from '../services/auth-rate-limit.service.js';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: AuthRateLimitService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = context.getHandler().name;
    if (kind === 'login' || kind === 'register') {
      const http = context.switchToHttp();
      await this.limiter.check(
        kind,
        http.getRequest<Request>(),
        http.getResponse<Response>(),
      );
    }
    return true;
  }
}
