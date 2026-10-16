import 'reflect-metadata';
import { SessionTokenSigner } from './ports/session-token-signer.js';
import { JwtSessionTokenSigner } from './infrastructure/jwt-session-token-signer.js';
import { SecurityAudit } from './ports/security-audit.js';
import { LoggingSecurityAudit } from './infrastructure/logging-security-audit.js';
import { AuthAuditMiddleware } from './presentation/auth-audit.middleware.js';
import { AccountStore } from './ports/account-store.js';
import { PrismaAccountStore } from './infrastructure/prisma-account-store.js';
import { PasswordHasher } from './ports/password-hasher.js';
import { ArgonPasswordHasher } from './infrastructure/argon-password-hasher.js';
import { AuthCookiePresenter } from './presentation/auth-cookie.presenter.js';
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
    AuthAuditMiddleware,
    { provide: SecurityAudit, useClass: LoggingSecurityAudit },
    AuthRecoveryService,
    AuthMailService,
    AuthOneTimeTokenService,
    AuthRateLimitService,
    AuthRateLimitGuard,
    CompromisedPasswordService,
    AuthService,
    { provide: SessionTokenSigner, useClass: JwtSessionTokenSigner },
    { provide: AccountStore, useClass: PrismaAccountStore },
    { provide: PasswordHasher, useClass: ArgonPasswordHasher },
    AuthCookiePresenter,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    AuthRedisStore,
    AuthSessionService,
    AuthCsrfService,
    AuthCsrfGuard,
  ],
  exports: [
    PassportModule,
    JwtModule,
    AuthService,
    JwtAuthGuard,
    RolesGuard,
    AuthCsrfGuard,
    AuthCsrfService,
  ],
})
export class AuthModule {}
