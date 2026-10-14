import { AuthRecoveryService } from './services/auth-recovery.service.js';
import { AuthMailService } from './services/auth-mail.service.js';
import { AuthOneTimeTokenService } from './services/auth-one-time-token.service.js';
import { AuthRateLimitGuard } from './guards/auth-rate-limit.guard.js';
import { AuthRateLimitService } from './services/auth-rate-limit.service.js';
import { CompromisedPasswordService } from './services/compromised-password.service.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { authJwtOptions } from './helpers/auth-config.js';
import { AuthRedisStore } from './services/auth-redis.store.js';
import { AuthSessionService } from './services/auth-session.service.js';
import { AuthCsrfService } from './services/auth-csrf.service.js';
import { AuthCsrfGuard } from './guards/auth-csrf.guard.js';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: authJwtOptions,
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthRecoveryService,
    AuthMailService,
    AuthOneTimeTokenService,
    AuthRateLimitService,
    AuthRateLimitGuard,
    CompromisedPasswordService,
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    AuthRedisStore,
    AuthSessionService,
    AuthCsrfService,
    AuthCsrfGuard,
  ],
  exports: [PassportModule, JwtModule, AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
