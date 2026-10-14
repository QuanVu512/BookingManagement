import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AuthCsrfService } from '../services/auth-csrf.service.js';

@Injectable()
export class AuthCsrfGuard implements CanActivate {
  constructor(private readonly csrf: AuthCsrfService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    await this.csrf.validate(request);
    return true;
  }
}
