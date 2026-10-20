import { Injectable } from '@nestjs/common';
import argon from 'argon2';
import { PasswordHasher } from '../ports/password-hasher.js';
import {
  AUTH_ERROR_CODES,
  AUTH_HASH_CONCURRENCY,
} from '../constants/auth-validation.constants.js';
import { authError } from '../helpers/auth-error.js';

@Injectable()
export class ArgonPasswordHasher extends PasswordHasher {
  private active = 0;
  hash(password: string): Promise<string> {
    return this.bounded(() => argon.hash(password));
  }

  verify(hash: string, password: string): Promise<boolean> {
    return this.bounded(() => argon.verify(hash, password));
  }

  private async bounded<Result>(
    operation: () => Promise<Result>,
  ): Promise<Result> {
    if (this.active >= AUTH_HASH_CONCURRENCY)
      throw authError(
        429,
        AUTH_ERROR_CODES.authRateLimited,
        'Quá nhiều yêu cầu xác thực. Vui lòng thử lại sau.',
      );
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }
}
