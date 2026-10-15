import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import {
  SecurityAudit,
  type SecurityAction,
  type SecurityOutcome,
} from '../ports/security-audit.js';

const ROUTES = new Map<string, SecurityAction>([
  ['/api/auth/login', 'login'],
  ['/api/auth/register', 'register'],
  ['/api/auth/logout', 'logout'],
  ['/api/auth/verify-email', 'verify-email'],
  ['/api/auth/reset-password', 'reset-password'],
  ['/api/auth/forgot-password', 'forgot-password'],
  ['/api/auth/resend-verification', 'resend-verification'],
]);

@Injectable()
export class AuthAuditMiddleware implements NestMiddleware {
  constructor(private readonly audit: SecurityAudit) {}
  use(request: Request, response: Response, next: NextFunction): void {
    const action = ROUTES.get(request.path.replace(/\/$/, '').toLowerCase());
    if (action && request.method === 'POST') {
      const requestId = randomUUID();
      response.setHeader('X-Request-Id', requestId);
      response.once('finish', () =>
        this.audit.record({
          action,
          requestId,
          outcome: outcome(response.statusCode),
        }),
      );
    }
    next();
  }
}

function outcome(status: number): SecurityOutcome {
  if (status === 429) return 'throttled';
  if (status >= 500) return 'unavailable';
  return status < 400 ? 'success' : 'denied';
}
