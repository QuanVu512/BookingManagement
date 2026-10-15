import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PasswordHasher } from '../ports/password-hasher.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { UserStatus } from '../../../enums/index.js';
import {
  AuthEmailDto,
  AuthTokenDto,
  ResetPasswordDto,
} from '../dto/auth-recovery.dto.js';
import type { LogoutResponseDto } from '../dto/auth-response.dto.js';
import { validateAuthInput } from '../helpers/validate-auth-input.js';
import { AuthOneTimeTokenService } from './auth-one-time-token.service.js';
import type { AuthTokenAccount } from './auth-one-time-token.service.js';
import { AuthMailService } from './auth-mail.service.js';
import type { AuthTokenPurpose } from './auth-mail.service.js';
import { CompromisedPasswordService } from './compromised-password.service.js';
import { AUTH_RECOVERY_RESPONSE_MS } from '../constants/auth-validation.constants.js';
import { AUTH_RECOVERY_CONCURRENCY } from '../constants/auth-validation.constants.js';
import { AuthRateLimitService } from './auth-rate-limit.service.js';

export const AUTH_RECOVERY_MESSAGE =
  'Nếu tài khoản phù hợp tồn tại, hướng dẫn sẽ được gửi qua email.';

@Injectable()
export class AuthRecoveryService {
  private activeDeliveries = 0;
  private readonly backgroundDeliveries = new Set<Promise<void>>();
  private readonly logger = new Logger(AuthRecoveryService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthOneTimeTokenService,
    private readonly mail: AuthMailService,
    private readonly passwords: CompromisedPasswordService,
    private readonly limiter: AuthRateLimitService,
    private readonly hasher: PasswordHasher,
  ) {}

  sendVerification(account: AuthTokenAccount): Promise<void> {
    if (this.activeDeliveries >= AUTH_RECOVERY_CONCURRENCY)
      return Promise.resolve();
    this.activeDeliveries++;
    // Delivery is observed and bounded but cannot extend the public registration response.
    const delivery = this.deliverInitialVerification(account)
      .catch(() => this.logger.warn('Auth email delivery unavailable.'))
      .finally(() => {
        this.activeDeliveries--;
        this.backgroundDeliveries.delete(delivery);
      });
    this.backgroundDeliveries.add(delivery);
    return Promise.resolve();
  }

  private async deliverInitialVerification(
    account: AuthTokenAccount,
  ): Promise<void> {
    if (await this.limiter.reserveRecipient(account.email, 'verify-email')) {
      await this.deliverIfEligible(account.email, 'verify-email');
    }
  }

  async requestEmail(
    input: AuthEmailDto,
    purpose: AuthTokenPurpose,
  ): Promise<LogoutResponseDto> {
    const dto = validateAuthInput(AuthEmailDto, input);
    const allowed = await this.limiter.reserveRecipient(dto.email, purpose);
    // Same response deadline for existing, missing, disabled and delivery-failed accounts.
    const deadline = new Promise<void>((resolve) =>
      setTimeout(resolve, AUTH_RECOVERY_RESPONSE_MS),
    );
    const delivery = this.deliverBounded(dto.email, purpose, allowed).catch(
      () => {
        this.logger.warn('Auth email delivery unavailable.');
      },
    );
    await Promise.all([deadline, Promise.race([delivery, deadline])]);
    return { success: true, message: AUTH_RECOVERY_MESSAGE };
  }

  private async deliverBounded(
    email: string,
    purpose: AuthTokenPurpose,
    allowed: boolean,
  ): Promise<void> {
    if (!allowed || this.activeDeliveries >= AUTH_RECOVERY_CONCURRENCY) return;
    this.activeDeliveries++;
    try {
      await this.deliverIfEligible(email, purpose);
    } finally {
      this.activeDeliveries--;
    }
  }

  async verifyEmail(input: AuthTokenDto): Promise<LogoutResponseDto> {
    const dto = validateAuthInput(AuthTokenDto, input);
    const account = await this.tokens.consume('verify-email', dto.token);
    const result = await this.prisma.user.updateMany({
      where: { ...this.accountWhere(account), emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    if (result.count !== 1) throw this.invalid();
    return {
      success: true,
      message: 'Email đã được xác minh. Bạn có thể đăng nhập.',
    };
  }

  async resetPassword(input: ResetPasswordDto): Promise<LogoutResponseDto> {
    const dto = validateAuthInput(ResetPasswordDto, input);
    const account = await this.tokens.read('reset-password', dto.token);
    const user = await this.prisma.user.findFirst({
      where: this.accountWhere(account),
    });
    if (!user) throw this.invalid();
    await this.passwords.assertAllowed(dto.password);
    const passwordHash = await this.hasher.hash(dto.password);
    const consumed = await this.tokens.consume('reset-password', dto.token);
    if (JSON.stringify(account) !== JSON.stringify(consumed))
      throw this.invalid();
    const result = await this.prisma.user.updateMany({
      where: this.accountWhere(account),
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    if (result.count !== 1) throw this.invalid();
    return {
      success: true,
      message: 'Mật khẩu đã được đặt lại. Vui lòng đăng nhập lại.',
    };
  }

  private async deliverIfEligible(
    email: string,
    purpose: AuthTokenPurpose,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      (purpose === 'verify-email' && user.emailVerifiedAt)
    )
      return;
    const account = {
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    };
    const token = await this.tokens.issue(purpose, account);
    await this.mail.sendToken(purpose, email, token);
  }

  private accountWhere(account: AuthTokenAccount) {
    return {
      id: account.id,
      email: account.email,
      tokenVersion: account.tokenVersion,
      status: UserStatus.ACTIVE,
    };
  }
  private invalid(): BadRequestException {
    return new BadRequestException('Liên kết không hợp lệ hoặc đã hết hạn.');
  }
}
