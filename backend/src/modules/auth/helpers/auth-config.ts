import { ConfigService } from '@nestjs/config';
import { AUTH_DEV_JWT_SECRET } from '../constants/auth-validation.constants.js';

export function resolveJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');
  const isProduction = configService.get<string>('NODE_ENV') === 'production';
  if (
    isProduction &&
    (!secret?.trim() || secret.trim() === AUTH_DEV_JWT_SECRET)
  ) {
    throw new Error('JWT_SECRET must be configured for production.');
  }
  return secret?.trim() ? secret : AUTH_DEV_JWT_SECRET;
}
