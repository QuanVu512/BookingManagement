import { SetMetadata } from '@nestjs/common';

export type AuthRatePolicy = 'login' | 'register' | 'recovery' | 'token';
export const AUTH_RATE_POLICY = 'auth:rate-policy';
export const AuthRateLimit = (policy: AuthRatePolicy) =>
  SetMetadata(AUTH_RATE_POLICY, policy);
