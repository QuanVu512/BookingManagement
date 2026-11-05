import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import {
  BookingConfirmationMailService,
  BOOKING_CONFIRMATION_MAIL_TIMEOUT_MS,
} from './booking-confirmation-mail.service.js';

function testConfig() {
  return new ConfigService({
    BOOKING_CONFIRMATION_MAIL_MEMORY: 'true',
    SMTP_FROM: 'test@localhost',
  } as Record<string, string>);
}

const BASE_CONTENT = {
  to: 'guest@example.com',
  recipientName: 'Khách vãng lai',
  recipientPhone: '0900000001',
  bookingCode: 'BK-100',
  courtName: 'Sân 1',
  startsAt: new Date('2035-01-08T01:00:00Z'),
  endsAt: new Date('2035-01-08T02:00:00Z'),
  totalAmount: 300_000,
  depositPaid: 90_000,
  remainingAmount: 210_000,
  isMember: false,
};

describe('BookingConfirmationMailService (thư xác nhận đặt sân)', () => {
  it('tiêu đề đúng thương hiệu và mã đơn', () => {
    const service = new BookingConfirmationMailService(testConfig());
    expect(service.confirmationSubject('BK-100')).toBe(
      '[SMASH ARENA] Xác nhận đặt sân thành công - Mã đơn BK-100',
    );
  });

  it('nội dung text có sân, khung giờ, cọc 30%, phần còn lại và lưu ý check-in', () => {
    const service = new BookingConfirmationMailService(testConfig());
    const text = service.buildTextBody(BASE_CONTENT);
    expect(text).toContain('Khách vãng lai');
    expect(text).toContain('Sân 1');
    expect(text).toContain('BK-100');
    expect(text).toContain('90.000đ');
    expect(text).toContain('210.000đ');
    expect(text).toContain('tại quầy khi đến sân');
    expect(text).toContain('trước 10 phút');
  });

  it('nội dung HTML escape tên người nhận để chống injection', () => {
    const service = new BookingConfirmationMailService(testConfig());
    const html = service.buildHtmlBody({
      ...BASE_CONTENT,
      recipientName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('BK-100');
  });

  it('chế độ bộ nhớ giữ thư cho khách vãng lai mà không chạm SMTP', async () => {
    const service = new BookingConfirmationMailService(testConfig());
    await service.sendConfirmationMail(BASE_CONTENT);
    expect(service.memoryOutbox).toHaveLength(1);
    expect(service.memoryOutbox[0].to).toBe('guest@example.com');
    expect(service.memoryOutbox[0].isMember).toBe(false);
  });

  it('chế độ bộ nhớ giữ thư cho thành viên với email từ hồ sơ', async () => {
    const service = new BookingConfirmationMailService(testConfig());
    await service.sendConfirmationMail({
      ...BASE_CONTENT,
      to: 'member@example.com',
      recipientName: 'Thành viên',
      isMember: true,
    });
    expect(service.memoryOutbox[0].to).toBe('member@example.com');
    expect(service.memoryOutbox[0].isMember).toBe(true);
  });

  it('timeout SMTP được chặn an toàn, không treo (SMTP_DELIVERY_FAILED)', async () => {
    const config = new ConfigService({
      BOOKING_CONFIRMATION_MAIL_MEMORY: 'false',
      NODE_ENV: 'development',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1',
      SMTP_FROM: 'no-reply@example.com',
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
    } as Record<string, string>);
    const service = new BookingConfirmationMailService(config);
    const startedAt = Date.now();
    await expect(service.sendConfirmationMail(BASE_CONTENT)).rejects.toThrow(
      'SMTP_DELIVERY_FAILED',
    );
    // Kịch bản xấu nhất vẫn xong trong timeout + biên CI, không treo vô hạn.
    expect(Date.now() - startedAt).toBeLessThan(
      BOOKING_CONFIRMATION_MAIL_TIMEOUT_MS + 30_000,
    );
  });

  it('email người nhận thiếu thì từ chối ngay, không gửi', async () => {
    const service = new BookingConfirmationMailService(testConfig());
    await expect(
      service.sendConfirmationMail({ ...BASE_CONTENT, to: '' }),
    ).rejects.toThrow('SMTP_DELIVERY_FAILED');
    expect(service.memoryOutbox).toHaveLength(0);
    expect(jest).toBeDefined();
  });
});
