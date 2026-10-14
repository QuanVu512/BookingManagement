import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { resolveJwtSecret } from '../helpers/auth-config.js';
import { AUTH_COOKIE_NAME } from '../constants/auth-validation.constants.js';
import { AuthSessionService } from '../services/auth-session.service.js';

const cookieOrHeaderExtractor = (req: Request): string | null => {
  if (req?.headers?.cookie) {
    const rawCookies = req.headers.cookie.split(';');
    for (const cookie of rawCookies) {
      const [name, ...rest] = cookie.trim().split('=');
      if (name === AUTH_COOKIE_NAME) {
        return rest.join('=');
      }
    }
  }
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly sessions: AuthSessionService,
  ) {
    super({
      jwtFromRequest: cookieOrHeaderExtractor,
      ignoreExpiration: false,
      secretOrKey: resolveJwtSecret(configService),
    });
  }

  validate(payload: unknown) {
    return this.sessions.authenticate(payload);
  }
}
