import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { resolveWebOrigin } from '../helpers/auth-config.js';
import {
  AUTH_MAIL_TIMEOUT_MS,
  AUTH_MAIL_CONNECT_TIMEOUT_MS,
} from '../constants/auth-validation.constants.js';

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

function smtpOptions(config: ConfigService): SMTPTransport.Options {
  const host = config.getOrThrow<string>('SMTP_HOST').trim();
  const port = Number(config.getOrThrow<string>('SMTP_PORT'));
  const secure = config.get<string>('SMTP_SECURE') === 'true';
  const requireTLS = config.get<string>('SMTP_REQUIRE_TLS') !== 'false';
  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (config.get<string>('NODE_ENV') === 'production' && !secure && !requireTLS)
  )
    throw new Error(
      'Invalid SMTP configuration. Production SMTP requires TLS.',
    );
  return {
    host,
    port,
    secure,
    requireTLS,
    auth: smtpAuth(config),
    connectionTimeout: AUTH_MAIL_CONNECT_TIMEOUT_MS,
    greetingTimeout: AUTH_MAIL_CONNECT_TIMEOUT_MS,
    socketTimeout: AUTH_MAIL_TIMEOUT_MS,
    logger: false,
    debug: false,
  };
}

function smtpAuth(config: ConfigService): SMTPTransport.Options['auth'] {
  const user = config.get<string>('SMTP_USER');
  const pass = config.get<string>('SMTP_PASSWORD');
  if (Boolean(user) !== Boolean(pass))
    throw new Error('SMTP_USER and SMTP_PASSWORD must be configured together.');
  return user && pass ? { user, pass } : undefined;
}
