import type { ConfigService } from '@nestjs/config';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import {
  AUTH_MAIL_CONNECT_TIMEOUT_MS,
  AUTH_MAIL_TIMEOUT_MS,
} from '../../modules/auth/constants/auth-validation.constants.js';

/**
 * Cấu hình SMTP dùng chung cho auth (xác minh email/OTP) và khách vãng lai
 * (thư phục hồi giữ chỗ). Tách nguyên văn từ AuthMailService, giữ đúng hành vi
 * kiểm tra và timeout. Mailpit local: SMTP_HOST=127.0.0.1, SMTP_PORT=1025.
 */
export function smtpOptions(config: ConfigService): SMTPTransport.Options {
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
