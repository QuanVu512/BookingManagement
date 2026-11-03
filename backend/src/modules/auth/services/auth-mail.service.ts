import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { resolveWebOrigin } from '../helpers/auth-config.js';
import { smtpOptions } from '../../../infrastructure/mail/smtp-options.js';
import { AUTH_MAIL_TIMEOUT_MS } from '../constants/auth-validation.constants.js';

export type AuthTokenPurpose = 'verify-email' | 'reset-password';

@Injectable()
export class AuthMailService {
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly webOrigin: string;

  constructor(config: ConfigService) {
    this.from = config.getOrThrow<string>('SMTP_FROM');
    this.webOrigin = resolveWebOrigin(config);
    if (!isEmail(this.from))
      throw new Error('Invalid SMTP_FROM configuration.');
    this.transport = nodemailer.createTransport(smtpOptions(config));
  }

  async sendToken(
    purpose: AuthTokenPurpose,
    email: string,
    token: string,
  ): Promise<void> {
    const link = `${this.webOrigin}/auth/${purpose}#token=${token}`;
    const subject =
      purpose === 'verify-email'
        ? 'Xác minh email Booking'
        : 'Đặt lại mật khẩu Booking';
    await this.deliver({
      from: this.from,
      to: email,
      subject,
      text: `${subject}\n\n${link}\n\nNếu bạn không gửi yêu cầu này, hãy bỏ qua email.`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  /** OTP delivery: 6 digits only, no links, never logged. */
  async sendEmailOtp(email: string, code: string): Promise<void> {
    await this.deliver({
      from: this.from,
      to: email,
      subject: 'Mã xác minh email Booking',
      text: `Mã xác minh email của bạn là: ${code}\n\nMã hết hạn sau 5 phút hoặc khi mã mới được tạo. Nếu bạn không yêu cầu, hãy bỏ qua email này.`,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  }

  private async deliver(message: SendMailOptions): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          this.transport.close();
          reject(new Error('Delivery timeout'));
        }, AUTH_MAIL_TIMEOUT_MS);
      });
      await Promise.race([this.transport.sendMail(message), timeout]);
    } catch {
      throw new ServiceUnavailableException(
        'Chưa thể gửi email xác minh. Vui lòng thử lại sau.',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
