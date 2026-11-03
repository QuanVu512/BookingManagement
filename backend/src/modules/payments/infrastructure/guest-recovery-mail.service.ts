import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { smtpOptions } from '../../../infrastructure/mail/smtp-options.js';
import { resolveWebOrigin } from '../../auth/helpers/auth-config.js';

export interface GuestRecoveryMailContent {
  to: string;
  bookingCode: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  prepaymentAmount: number;
  holdExpiresAt: Date;
  /** Token thô CHỈ tồn tại trong bộ nhớ tiến trình khi gửi; không log. */
  token: string;
  bookingId: string;
}

const GUEST_RECOVERY_MAIL_TIMEOUT_MS = 15000;

/**
 * Gửi thư phục hồi giữ chỗ cho khách vãng lai (Task 5.1).
 * Link đặt token trong fragment (`#recovery=`), không bao giờ lên query/log
 * server (AC-19). Chế độ bộ nhớ (`GUEST_RECOVERY_MAIL_MEMORY=true`) dùng cho
 * test tự động (Q2): không chạm SMTP, thư được giữ trong instance.
 */
@Injectable()
export class GuestRecoveryMailService {
  private readonly from: string;
  private readonly webOrigin: string;
  private readonly memoryMode: boolean;
  private transport: Transporter | null = null;
  readonly memoryOutbox: GuestRecoveryMailContent[] = [];

  constructor(private readonly config: ConfigService) {
    this.memoryMode =
      config.get<string>('GUEST_RECOVERY_MAIL_MEMORY') === 'true';
    if (!this.memoryMode) {
      this.from = config.getOrThrow<string>('SMTP_FROM');
      if (!this.from || !this.from.includes('@'))
        throw new Error('Invalid SMTP_FROM configuration.');
    } else {
      this.from = 'test@localhost';
    }
    this.webOrigin = resolveWebOrigin(config);
  }

  recoveryLink(bookingId: string, token: string): string {
    return `${this.webOrigin}/booking?recover=${bookingId}#recovery=${token}`;
  }

  async sendRecoveryMail(content: GuestRecoveryMailContent): Promise<void> {
    if (this.memoryMode) {
      this.memoryOutbox.push({ ...content });
      return;
    }
    const link = this.recoveryLink(content.bookingId, content.token);
    const message: SendMailOptions = {
      from: this.from,
      to: content.to,
      subject: `Tiếp tục thanh toán giữ chỗ ${content.bookingCode}`,
      text: [
        `Bạn đang giữ chỗ ${content.courtName} (${content.bookingCode}).`,
        `Tiền cọc cần thanh toán: ${content.prepaymentAmount.toLocaleString('vi-VN')}đ.`,
        `Giữ chỗ hết hạn lúc: ${content.holdExpiresAt.toISOString()}.`,
        '',
        'Mở liên kết sau để tiếp tục thanh toán:',
        link,
        '',
        'Nếu bạn không đặt sân, hãy bỏ qua email này.',
      ].join('\n'),
      disableFileAccess: true,
      disableUrlAccess: true,
    };
    await this.deliver(message);
  }

  private async deliver(message: SendMailOptions): Promise<void> {
    if (!this.transport) {
      this.transport = nodemailer.createTransport(smtpOptions(this.config));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          this.transport?.close();
          reject(new Error('Delivery timeout'));
        }, GUEST_RECOVERY_MAIL_TIMEOUT_MS);
      });
      await Promise.race([this.transport.sendMail(message), timeout]);
    } catch {
      // Không để token/token thô lọt vào lỗi (P5-08); caller quyết định retry.
      throw new Error('SMTP_DELIVERY_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }
}
