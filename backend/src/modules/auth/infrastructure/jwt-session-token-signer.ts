import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SessionTokenSigner } from '../ports/session-token-signer.js';
import { AuthSessionService } from '../services/auth-session.service.js';
import { AUTH_TOKEN_TTL } from '../constants/auth-validation.constants.js';

@Injectable()
export class JwtSessionTokenSigner extends SessionTokenSigner {
  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: AuthSessionService,
  ) {
    super();
  }
  sign(userId: string, tokenVersion: number): Promise<string> {
    return this.jwt.signAsync(this.sessions.claims(userId, tokenVersion), {
      expiresIn: AUTH_TOKEN_TTL,
    });
  }
}
