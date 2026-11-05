import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import type { Transporter, SendMailOptions } from 'nodemailer';
import { smtpOptions } from '../../../infrastructure/mail/smtp-options.js';

export interface BookingConfirmationMailContent {
  to: string;
  recipientName: string;
  recipientPhone: string | null;
  bookingCode: string;
  courtName: string;
  startsAt: Date;
  endsAt: Date;
  totalAmount: number;
  depositPaid: number;
  remainingAmount: number;
  isMember: boolean;
}

export const BOOKING_CONFIRMATION_MAIL_TIMEOUT_MS = 15000;

const BOOKING_CONFIRMATION_MEMORY_FLAG = 'BOOKING_CONFIRMATION_MAIL_MEMORY';

/**
 * Gửi thư xác nhận đặt sân thành công (cọc 30% đã xác minh).
 * Chế độ bộ nhớ (`BOOKING_CONFIRMATION_MAIL_MEMORY=true` hoặc
 * `NODE_ENV=test`) dùng cho test tự động: không chạm SMTP, thư được giữ
 * trong instance. Không bao giờ gọi trong transaction DB — chỉ worker nền
 * gọi sau khi booking đã CONFIRMED.
 */
@Injectable()
export class BookingConfirmationMailService {
  private readonly from: string;
  private readonly memoryMode: boolean;
  private transport: Transporter | null = null;
  readonly memoryOutbox: BookingConfirmationMailContent[] = [];

  constructor(private readonly config: ConfigService) {
    this.memoryMode =
      config.get<string>(BOOKING_CONFIRMATION_MEMORY_FLAG) === 'true' ||
      config.get<string>('NODE_ENV') === 'test';
    if (!this.memoryMode) {
      this.from = config.getOrThrow<string>('SMTP_FROM');
      if (!this.from || !this.from.includes('@'))
        throw new Error('Invalid SMTP_FROM configuration.');
    } else {
      this.from = config.get<string>('SMTP_FROM') || 'test@localhost';
    }
  }

  confirmationSubject(bookingCode: string): string {
    return `[SMASH ARENA] Xác nhận đặt sân thành công - Mã đơn ${bookingCode}`;
  }

  buildTextBody(content: BookingConfirmationMailContent): string {
    return [
      `Xin chào ${content.recipientName},`,
      '',
      `SMASH ARENA xác nhận bạn đã đặt sân thành công (mã đơn ${content.bookingCode}).`,
      `Sân thi đấu: ${content.courtName}.`,
      `Ngày và khung giờ chơi: ${this.formatSlot(content.startsAt, content.endsAt)}.`,
      `Tiền cọc 30% đã thanh toán: ${this.formatVnd(content.depositPaid)}.`,
      `Số tiền còn lại (${this.formatVnd(content.remainingAmount)}) sẽ thanh toán tại quầy khi đến sân.`,
      '',
      'Lưu ý check-in: mang theo mã đơn hoặc số điện thoại khi tới sân trước 10 phút.',
      '',
      'Cảm ơn bạn đã đặt sân tại SMASH ARENA!',
    ].join('\n');
  }

  buildHtmlBody(content: BookingConfirmationMailContent): string {
    const slot = this.formatSlot(content.startsAt, content.endsAt);
    return [
      `<p>Xin chào <strong>${this.escapeHtml(content.recipientName)}</strong>,</p>`,
      `<p>SMASH ARENA xác nhận bạn đã đặt sân thành công (mã đơn <strong>${this.escapeHtml(content.bookingCode)}</strong>).</p>`,
      '<ul>',
      `<li>Sân thi đấu: <strong>${this.escapeHtml(content.courtName)}</strong></li>`,
      `<li>Ngày và khung giờ chơi: <strong>${this.escapeHtml(slot)}</strong></li>`,
      `<li>Tiền cọc 30% đã thanh toán: <strong>${this.escapeHtml(this.formatVnd(content.depositPaid))}</strong></li>`,
      `<li>Số tiền còn lại sẽ thanh toán tại quầy khi đến sân: <strong>${this.escapeHtml(this.formatVnd(content.remainingAmount))}</strong></li>`,
      '</ul>',
      '<p>Lưu ý check-in: mang theo mã đơn hoặc số điện thoại khi tới sân trước 10 phút.</p>',
      '<p>Cảm ơn bạn đã đặt sân tại SMASH ARENA!</p>',
    ].join('\n');
  }

  async sendConfirmationMail(
    content: BookingConfirmationMailContent,
  ): Promise<void> {
    if (!content.to || !content.to.includes('@'))
      throw new Error('SMTP_DELIVERY_FAILED');
    if (this.memoryMode) {
      this.memoryOutbox.push({ ...content });
      return;
    }
    const message: SendMailOptions = {
      from: this.from,
      to: content.to,
      subject: this.confirmationSubject(content.bookingCode),
      text: this.buildTextBody(content),
      html: this.buildHtmlBody(content),
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
        }, BOOKING_CONFIRMATION_MAIL_TIMEOUT_MS);
      });
      await Promise.race([this.transport.sendMail(message), timeout]);
    } catch {
      // Không để chi tiết SMTP lọt ra ngoài; caller quyết định retry.
      throw new Error('SMTP_DELIVERY_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }

  private formatVnd(amount: number): string {
    return `${amount.toLocaleString('vi-VN')}đ`;
  }

  private formatSlot(startsAt: Date, endsAt: Date): string {
    const start = new Date(startsAt);
    const end = new Date(endsAt);
    return `${start.toLocaleString('vi-VN')} - ${end.toLocaleString('vi-VN')}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
