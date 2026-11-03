import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayosDemoSigner, isDemoLinkId } from './payos-demo-signer.js';

export { isDemoLinkId };

/**
 * BE-PAY-DEMO — Adapter tạo link thanh toán demo ở ranh giới gateway (F02).
 * - Khi cờ simulation bật, ưu tiên adapter demo kể cả có credential provider.
 * - Link cục bộ, KHÔNG gọi mạng payOS, KHÔNG sinh QR ngân hàng thật:
 *   checkoutUrl trỏ về trang kết quả nội bộ, qr payload là chuỗi demo.
 * - Id `DEMO_<paymentCode>` bền vững theo request để workers nhận diện và
 *   không bao giờ query/cancel provider thật cho intent demo.
 */
export interface DemoLinkResult {
  paymentLinkId: string;
  orderCode: number;
  checkoutUrl: string;
  qrCode: string;
  accountNumber: string;
  accountName: string;
  bin: string;
}

const DEMO_ACCOUNT_NAME = 'SHOWCASE DEMO (KHONG THU TIEN)';

@Injectable()
export class PayosDemoGatewayAdapter {
  constructor(
    private readonly signer: PayosDemoSigner,
    private readonly config: ConfigService,
  ) {}

  isDemoAvailable(): boolean {
    return this.signer.isSimulationEnabled();
  }

  async createDemoLink(input: {
    paymentCode: string;
    amount: number;
  }): Promise<DemoLinkResult> {
    if (!this.isDemoAvailable()) {
      throw new Error('Chế độ demo chưa được bật trên server.');
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('Số tiền demo không hợp lệ.');
    }
    const webOrigin =
      this.config.get<string>('WEB_ORIGIN') ?? 'http://localhost:4001';
    return {
      paymentLinkId: this.signer.demoLinkIdFor(input.paymentCode),
      orderCode: this.signer.stableOrderCodeFor(input.paymentCode),
      checkoutUrl: `${webOrigin}/payment/result?code=${input.paymentCode}`,
      qrCode: `DEMO-SIMULATION:${input.paymentCode}`,
      accountNumber: this.signer.demoAccountNumber(),
      accountName: DEMO_ACCOUNT_NAME,
      bin: '',
    };
  }
}
