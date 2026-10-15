import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Reflector } from '@nestjs/core';
import {
  AUTH_RATE_POLICY,
  type AuthRatePolicy,
} from '../decorators/auth-rate-policy.decorator.js';
import { AuthRateLimitService } from '../services/auth-rate-limit.service.js';

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(
    private readonly limiter: AuthRateLimitService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const kind = this.reflector.get<AuthRatePolicy>(
      AUTH_RATE_POLICY,
      context.getHandler(),
    );
    if (kind) {
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
