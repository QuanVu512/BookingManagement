import type { Request, CookieOptions } from 'express';
import { ConfigService } from '@nestjs/config';

export function readAuthCookie(
  request: Request,
  name: string,
): string | undefined {
  return request.headers.cookie
    ?.split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function authCookieOptions(config: ConfigService): CookieOptions {
  const production = config.get<string>('NODE_ENV') === 'production';
  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? 'none' : 'lax',
    path: '/',
  };
}
