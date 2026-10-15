import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_MS,
} from '../constants/auth-validation.constants.js';
import { authCookieOptions } from '../helpers/auth-cookie.js';
import type { AuthResponseDto } from '../dto/auth-response.dto.js';

import type { LoginResult } from '../application/auth-results.js';

@Injectable()
export class AuthCookiePresenter {
  constructor(private readonly config: ConfigService) {}

  login(result: LoginResult, response: Response): AuthResponseDto {
    response.cookie(AUTH_COOKIE_NAME, result.accessToken, {
      ...authCookieOptions(this.config),
      maxAge: AUTH_COOKIE_MAX_AGE_MS,
    });
    return result.body;
  }

  clear(response: Response): void {
    response.clearCookie(AUTH_COOKIE_NAME, authCookieOptions(this.config));
  }
}
