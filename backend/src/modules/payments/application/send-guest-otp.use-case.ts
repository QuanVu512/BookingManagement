import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  GUEST_OTP_CODE_TTL_MS,
  GUEST_OTP_PURPOSE,
  GUEST_OTP_RESEND_COOLDOWN_MS,
  generateGuestOtpCode,
  guestOtpResendRetryAfterSeconds,
  hashGuestOtpCode,
} from '../domain/guest-otp-policy.js';
import {
  GuestCheckoutPayloadError,
  normalizeGuestEmail,
} from '../domain/guest-checkout-fingerprint.js';
import { GuestCheckoutStore } from '../ports/guest-checkout-store.js';
import { GuestOtpSender } from '../ports/guest-otp-sender.js';

export interface SendGuestOtpResult {
  resendAfterSeconds: number;
  expiresAt: string;
}

/**
 * Bước 2 — phát OTP 6 số lưu PostgreSQL.
 * - Chỉ hash code; code thô ở memory đủ để gửi email.
 * - Resend cooldown 60 giây dưới advisory lock theo email (race-safe).
 * - Gửi challenge mới invalidate mọi challenge cũ chưa dùng của email.
 */
@Injectable()
export class SendGuestOtpUseCase {
  private readonly logger = new Logger(SendGuestOtpUseCase.name);

  constructor(
    private readonly store: GuestCheckoutStore,
    private readonly sender: GuestOtpSender,
  ) {}

  async execute(emailInput: string): Promise<SendGuestOtpResult> {
    let email: string;
    try {
      email = normalizeGuestEmail(emailInput);
    } catch (error: unknown) {
      if (error instanceof GuestCheckoutPayloadError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }

    const code = generateGuestOtpCode();
    const codeHash = hashGuestOtpCode(email, GUEST_OTP_PURPOSE, code);

    const challenge = await this.store.withTransaction(async (transaction, store) => {
      await store.lockOtpRecipient(transaction, email);
      const now = await store.databaseNowIn(transaction);
      const lastCreatedAt = await store.findLatestChallengeCreatedAtIn(
        transaction,
        email,
      );
      const retryAfterSeconds = guestOtpResendRetryAfterSeconds(
        lastCreatedAt,
        now,
      );
      if (retryAfterSeconds > 0) {
        throw new HttpException(
          {
            code: 'OTP_RESEND_COOLDOWN',
            message: `Vui lòng đợi ${retryAfterSeconds} giây trước khi gửi lại mã.`,
            retryAfterSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await store.invalidateActiveChallengesIn(transaction, email, now);
      return store.insertChallengeIn(transaction, {
        email,
        purpose: GUEST_OTP_PURPOSE,
        codeHash,
        expiresAt: new Date(now.getTime() + GUEST_OTP_CODE_TTL_MS),
      });
    });

    try {
      await this.sender.sendCode(email, code);
    } catch (error: unknown) {
      // Xóa hẳn challenge vì mã chưa từng tới tay khách: lần gửi lại không bị
      // cooldown oan và mã này cũng không thể dùng.
      await this.store.withTransaction(async (transaction, store) => {
        await store.deleteChallengeIn(transaction, challenge.id);
      });
      this.logger.warn('Guest OTP delivery failed; challenge deleted.');
      throw error;
    }

    return {
      resendAfterSeconds: Math.ceil(GUEST_OTP_RESEND_COOLDOWN_MS / 1000),
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }
}
