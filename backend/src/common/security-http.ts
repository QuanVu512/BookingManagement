import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

export function securityHeaders(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Request-Id', randomUUID());
  const path = request.path.toLowerCase();
  if (path === '/api/auth' || path.startsWith('/api/auth/')) {
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Pragma', 'no-cache');
  }
  next();
}
