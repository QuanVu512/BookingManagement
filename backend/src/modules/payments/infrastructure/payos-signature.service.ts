import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS, type Webhook } from '@payos/node';

/**
 * BE-PAY-07 — payOS signature service (MIG-06).
 * Luôn verify FULL webhook envelope qua SDK `payos.webhooks.verify` với
 * checksum key cấu hình trên server; chỉ dùng signed data trả về.
 * Outer success / redirect không bao giờ thay thế signed success.
 *
 * Verify-only: client dựng được khi có PAYOS_CHECKSUM_KEY (clientId/apiKey
 * có thể để trống ở deployment demo không thu tiền thật). Gateway chuyển
 * tiền thật (PayosGatewayAdapter) vẫn yêu cầu đủ ba key — tách "xác minh
 * được" khỏi "được phép moving money" để demo ký/xác minh nội bộ mà không
 * bao giờ gọi mạng payOS (F02/F06 review).
 */
export interface VerifiedWebhookData {
  orderCode: number;
  amount: number;
  description?: string;
  accountNumber?: string;
  reference?: string;
  transactionDateTime?: string;
  currency?: string;
  paymentLinkId?: string;
  code?: string;
  desc?: string;
  counterAccountBankId?: string;
  counterAccountBankName?: string;
  counterAccountName?: string;
  counterAccountNumber?: string;
  virtualAccountName?: string;
  virtualAccountNumber?: string;
  [key: string]: unknown;
}

@Injectable()
export class PayosSignatureService {
  private readonly logger = new Logger(PayosSignatureService.name);
  private readonly client: PayOS | null;

  constructor(configService: ConfigService) {
    // Verify chỉ cần checksum key; clientId/apiKey thiếu thì dùng placeholder
    // không bao giờ được gửi đi ở đường verify (MIG-20 giữ fail-closed khi
    // thiếu checksum key).
    const checksumKey = configService.get<string>('PAYOS_CHECKSUM_KEY');
    if (checksumKey) {
      this.client = new PayOS({
        clientId:
          configService.get<string>('PAYOS_CLIENT_ID') || 'unconfigured',
        apiKey: configService.get<string>('PAYOS_API_KEY') || 'unconfigured',
        checksumKey,
      });
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /**
   * Verify envelope { data, signature }. Ném lỗi khi thiếu field,
   * chữ ký sai, hoặc provider chưa cấu hình (fail-closed, MIG-20).
   */
  async verifyEnvelope(envelope: unknown): Promise<VerifiedWebhookData> {
    if (!this.client) {
      throw new Error('payOS chưa được cấu hình trên server.');
    }
    if (
      typeof envelope !== 'object' ||
      envelope === null ||
      !('data' in envelope) ||
      !('signature' in envelope)
    ) {
      throw new Error('Webhook envelope thiếu data/signature.');
    }
    try {
      const data = await this.client.webhooks.verify(envelope as Webhook);
      return data as unknown as VerifiedWebhookData;
    } catch (error: unknown) {
      this.logger.warn('payOS webhook signature invalid.');
      throw new Error(
        error instanceof Error
          ? `Chữ ký webhook không hợp lệ: ${error.message}`
          : 'Chữ ký webhook không hợp lệ.',
      );
    }
  }

  /**
   * MIG-06: signed success code là điều kiện cần — code '00' của payOS.
   * Outer wrapper success không được dùng để credit.
   */
  isSignedSuccess(data: VerifiedWebhookData): boolean {
    return data.code === '00';
  }

  /**
   * Canonical receipt identity (MIG-06): receivingAccountKey +
   * normalized bank reference, thống nhất giữa WEBHOOK / PROVIDER_QUERY
   * / STAFF. Cùng identity nhưng amount/account/order khác → quarantine,
   * không sinh receipt credit thứ hai.
   */
  canonicalIdentity(input: {
    receivingAccountKey: string;
    transactionReference: string | null | undefined;
  }): string {
    const account = input.receivingAccountKey.trim().toUpperCase();
    const reference = (input.transactionReference ?? '').trim().toUpperCase();
    if (!account || !reference) {
      throw new Error('Thiếu receiving account hoặc bank reference.');
    }
    return `${account}::${reference}`;
  }

  receivingAccountKeyFor(input: {
    channelId: string;
    accountNumber?: string;
  }): string {
    const account = (input.accountNumber ?? '').trim();
    return account ? `${input.channelId}:${account}` : input.channelId;
  }
}
