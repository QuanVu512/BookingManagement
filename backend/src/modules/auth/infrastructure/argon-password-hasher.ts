import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import argon from 'argon2';
import { PasswordHasher } from '../ports/password-hasher.js';
import { AUTH_HASH_CONCURRENCY } from '../constants/auth-validation.constants.js';

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
      throw new HttpException(
        'Authentication capacity exceeded.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    this.active++;
    try {
      return await operation();
    } finally {
      this.active--;
    }
  }
}
