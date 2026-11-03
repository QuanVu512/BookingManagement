import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'node:crypto';

/**
 * BE-PAY-DEMO — Ký webhook mô phỏng payOS (F06 review).
 * - HMAC-SHA256 với canonicalization Y HỆT SDK payOS
 *   (sort key + query string), để verifier thật
 *   (PayosSignatureService → SDK verify) kiểm chứng độc lập.
 * - Signer này KHÔNG thay quyền: caller phải authorize owner trước khi ký.
 * - Chỉ dùng trong deployment showcase đã bật cờ + DB/key demo riêng;
 *   không bao giờ ký bằng merchant key thu tiền thật.
 */
export const DEMO_SIMULATION_ENV = 'ENABLE_PAYMENT_SIMULATION';
export const DEMO_ACCOUNT_ENV = 'PAYOS_DEMO_ACCOUNT_NUMBER';
export const DEMO_LINK_PREFIX = 'DEMO_';
export const DEMO_DEFAULT_ACCOUNT_NUMBER = 'DEMO_888888';

export interface DemoWebhookData {
  orderCode: number;
  amount: number;
  description: string;
  accountNumber: string;
  reference: string;
  transactionDateTime: string;
  currency: string;
  paymentLinkId: string | null;
  code: string;
  desc: string;
}

export function isDemoLinkId(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(DEMO_LINK_PREFIX);
}

@Injectable()
export class PayosDemoSigner {
  constructor(private readonly config: ConfigService) {}

  /** Flag server, mặc định tắt; chỉ đúng chuỗi 'true' mới bật. */
  isSimulationEnabled(): boolean {
    return this.config.get<string>(DEMO_SIMULATION_ENV) === 'true';
  }

  demoAccountNumber(): string {
    const configured = (this.config.get<string>(DEMO_ACCOUNT_ENV) ?? '').trim();
    return configured.length > 0 ? configured : DEMO_DEFAULT_ACCOUNT_NUMBER;
  }

  /**
   * orderCode số ổn định theo payment request (F05): cùng request luôn ra
   * cùng số qua retry, nhiều tab hay restart; request khác ra số khác.
   */
  stableOrderCodeFor(paymentCode: string): number {
    const digest = createHash('sha256')
      .update(`demo-order:${paymentCode}`)
      .digest('hex');
    return 1_000_000 + (parseInt(digest.slice(0, 8), 16) % 998_000_000);
  }

  demoLinkIdFor(paymentCode: string): string {
    return `${DEMO_LINK_PREFIX}${paymentCode}`;
  }

  /**
   * Dựng payload demo từ sự thật DB (F03): amount/link từ payment request,
   * description/reference chứa paymentCode thực để worker khớp canonical.
   */
  buildDemoData(input: {
    paymentCode: string;
    amount: number;
    paymentLinkId: string | null;
    occurredAt: Date;
  }): DemoWebhookData {
    return {
      orderCode: this.stableOrderCodeFor(input.paymentCode),
      amount: input.amount,
      description: `DEMO ${input.paymentCode} showcase khong thu tien that`,
      accountNumber: this.demoAccountNumber(),
      reference: input.paymentCode,
      transactionDateTime: this.formatTransactionDateTime(input.occurredAt),
      currency: 'VND',
      paymentLinkId: input.paymentLinkId,
      code: '00',
      desc: 'success',
    };
  }

  /**
   * Ký HMAC-SHA256 đúng canonical của SDK payOS để verifier thật kiểm tra.
   * Ném lỗi khi thiếu checksum key (fail-closed).
   */
  signWebhookData(data: DemoWebhookData): string {
    const checksumKey = this.config.get<string>('PAYOS_CHECKSUM_KEY') ?? '';
    if (!checksumKey) {
      throw new Error('payOS checksum key chưa được cấu hình.');
    }
    return createHmac('sha256', checksumKey)
      .update(this.toCanonicalQueryString(data))
      .digest('hex');
  }

  private formatTransactionDateTime(value: Date): string {
    const pad = (part: number): string => String(part).padStart(2, '0');
    return (
      `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ` +
      `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
    );
  }

  /**
   * Sao đúng `createSignatureFromObj` của SDK: sort key tăng dần rồi nối
   * `key=value`; null/undefined/'null'/'undefined' thành chuỗi rỗng.
   */
  private toCanonicalQueryString(data: DemoWebhookData): string {
    const record = data as unknown as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => {
        let value: unknown = record[key];
        if (Array.isArray(value)) {
          value = JSON.stringify(value);
        }
        if (
          value === null ||
          value === undefined ||
          value === 'null' ||
          value === 'undefined'
        ) {
          value = '';
        }
        return `${key}=${value as string | number}`;
      })
      .join('&');
  }
}
