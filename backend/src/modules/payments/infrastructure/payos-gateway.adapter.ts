import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS, type CreatePaymentLinkResponse } from '@payos/node';

/**
 * BE-PAY-07/08 — payOS gateway adapter.
 * - Provider calls LUÔN NGOÀI transaction (caller chịu trách nhiệm).
 * - Timeouts + error map chuẩn; 502/503/504/timeout không bao giờ suy
 *   FAILED — caller giữ CREATING để reconciler fill sau (E5).
 * - `qrCode`/`checkoutUrl`/bank fields chỉ tin từ create response đã xác
 *   minh (MIG-09); GET không trả các fields này nên không dùng để fill.
 */
export interface LinkCreateInput {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  expiredAtUnix: number;
}

export interface LinkCreateResult {
  paymentLinkId: string;
  orderCode: number;
  checkoutUrl: string;
  qrCode: string;
  accountNumber: string;
  accountName: string;
  bin: string;
}

@Injectable()
export class PayosGatewayAdapter {
  private readonly logger = new Logger(PayosGatewayAdapter.name);
  private readonly client: PayOS | null;

  constructor(configService: ConfigService) {
    const clientId = configService.get<string>('PAYOS_CLIENT_ID');
    const apiKey = configService.get<string>('PAYOS_API_KEY');
    const checksumKey = configService.get<string>('PAYOS_CHECKSUM_KEY');
    this.client =
      clientId && apiKey && checksumKey
        ? new PayOS({ clientId, apiKey, checksumKey })
        : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async createLink(input: LinkCreateInput): Promise<LinkCreateResult> {
    if (!this.client) throw new Error('PAYOS_NOT_CONFIGURED');
    const timeoutMs = 10_000;
    const response = (await Promise.race([
      this.client.paymentRequests.create({
        orderCode: input.orderCode,
        amount: input.amount,
        description: input.description.slice(0, 25),
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
        expiredAt: input.expiredAtUnix,
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('PAYOS_TIMEOUT')), timeoutMs);
      }),
    ])) as CreatePaymentLinkResponse;
    if (!response.checkoutUrl || !response.paymentLinkId) {
      throw new Error('PAYOS_MALFORMED_RESPONSE');
    }
    return {
      paymentLinkId: response.paymentLinkId,
      orderCode: response.orderCode,
      checkoutUrl: response.checkoutUrl,
      qrCode: response.qrCode ?? '',
      accountNumber: response.accountNumber ?? '',
      accountName: response.accountName ?? '',
      bin: response.bin ?? '',
    };
  }

  async getLink(paymentLinkId: string) {
    if (!this.client) throw new Error('PAYOS_NOT_CONFIGURED');
    return this.client.paymentRequests.get(paymentLinkId);
  }

  async cancelLink(
    paymentLinkId: string,
    reason: string,
  ): Promise<boolean> {
    if (!this.client) {
      this.logger.warn('cancelLink skipped: payOS not configured.');
      return false;
    }
    try {
      await this.client.paymentRequests.cancel(
        paymentLinkId,
        reason.slice(0, 200),
      );
      return true;
    } catch (error: unknown) {
      // Cancel best-effort: failure không phá state nội bộ (BE-PAY-16).
      this.logger.warn(
        `cancelLink failed for ${paymentLinkId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return false;
    }
  }
}
