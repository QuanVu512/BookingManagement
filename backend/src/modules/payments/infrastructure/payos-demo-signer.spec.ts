import { PayOS } from '@payos/node';
import { ConfigService } from '@nestjs/config';
import {
  DEMO_DEFAULT_ACCOUNT_NUMBER,
  PayosDemoSigner,
} from './payos-demo-signer.js';

const CHECKSUM_KEY = 'demo-checksum-key-for-tests-only';

function signerWithEnv(
  env: Record<string, string | undefined>,
): PayosDemoSigner {
  const config = { get: (key: string) => env[key] } as ConfigService;
  return new PayosDemoSigner(config);
}

function verifier(): PayOS {
  return new PayOS({
    clientId: 'demo-client',
    apiKey: 'demo-key',
    checksumKey: CHECKSUM_KEY,
  });
}

describe('PayosDemoSigner (BE-PAY-DEMO, F05/F06)', () => {
  it('tắt mặc định; chỉ đúng chuỗi true mới bật', () => {
    expect(signerWithEnv({}).isSimulationEnabled()).toBe(false);
    expect(
      signerWithEnv({
        ENABLE_PAYMENT_SIMULATION: 'false',
      }).isSimulationEnabled(),
    ).toBe(false);
    expect(
      signerWithEnv({ ENABLE_PAYMENT_SIMULATION: '1' }).isSimulationEnabled(),
    ).toBe(false);
    expect(
      signerWithEnv({
        ENABLE_PAYMENT_SIMULATION: 'true',
      }).isSimulationEnabled(),
    ).toBe(true);
  });

  it('identity bền vững theo payment request qua retry/restart', () => {
    const signer = signerWithEnv({ ENABLE_PAYMENT_SIMULATION: 'true' });
    const first = signer.buildDemoData({
      paymentCode: 'PAY-ABCDEF123456',
      amount: 45000,
      paymentLinkId: 'DEMO_PAY-ABCDEF123456',
      occurredAt: new Date('2026-10-31T10:00:00'),
    });
    const second = signer.buildDemoData({
      paymentCode: 'PAY-ABCDEF123456',
      amount: 45000,
      paymentLinkId: 'DEMO_PAY-ABCDEF123456',
      occurredAt: new Date('2026-10-31T10:05:00'),
    });
    expect(second.reference).toBe(first.reference);
    expect(second.orderCode).toBe(first.orderCode);
    expect(second.description).toContain('PAY-ABCDEF123456');
    const other = signer.buildDemoData({
      paymentCode: 'PAY-FFFFFFFFFFFF',
      amount: 45000,
      paymentLinkId: null,
      occurredAt: new Date(),
    });
    expect(other.reference).not.toBe(first.reference);
    expect(other.orderCode).not.toBe(first.orderCode);
  });

  it('chữ ký được SDK verifier thật chấp nhận (oracle độc lập)', async () => {
    const signer = signerWithEnv({
      ENABLE_PAYMENT_SIMULATION: 'true',
      PAYOS_CHECKSUM_KEY: CHECKSUM_KEY,
    });
    const data = signer.buildDemoData({
      paymentCode: 'PAY-ABCDEF123456',
      amount: 45000,
      paymentLinkId: 'DEMO_PAY-ABCDEF123456',
      occurredAt: new Date('2026-10-31T10:00:00'),
    });
    const signature = signer.signWebhookData(data);
    const verified = await verifier().webhooks.verify({ data, signature });
    expect(verified).toMatchObject({
      reference: 'PAY-ABCDEF123456',
      amount: 45000,
      code: '00',
    });
  });

  it('SDK verifier thật từ chối khi amount/reference bị sửa sau khi ký', async () => {
    const signer = signerWithEnv({
      ENABLE_PAYMENT_SIMULATION: 'true',
      PAYOS_CHECKSUM_KEY: CHECKSUM_KEY,
    });
    const data = signer.buildDemoData({
      paymentCode: 'PAY-ABCDEF123456',
      amount: 45000,
      paymentLinkId: null,
      occurredAt: new Date('2026-10-31T10:00:00'),
    });
    const signature = signer.signWebhookData(data);
    await expect(
      verifier().webhooks.verify({
        data: { ...data, amount: 145000 },
        signature,
      }),
    ).rejects.toThrow();
    await expect(
      verifier().webhooks.verify({
        data: { ...data, reference: 'PAY-FFFFFFFFFFFF' },
        signature,
      }),
    ).rejects.toThrow();
  });

  it('fail-closed khi thiếu checksum key', () => {
    const signer = signerWithEnv({ ENABLE_PAYMENT_SIMULATION: 'true' });
    const data = signer.buildDemoData({
      paymentCode: 'PAY-ABCDEF123456',
      amount: 45000,
      paymentLinkId: null,
      occurredAt: new Date(),
    });
    expect(() => signer.signWebhookData(data)).toThrow();
  });

  it('dùng account demo cấu hình, fallback hằng số rõ nghĩa', () => {
    expect(signerWithEnv({}).demoAccountNumber()).toBe(
      DEMO_DEFAULT_ACCOUNT_NUMBER,
    );
    expect(
      signerWithEnv({
        PAYOS_DEMO_ACCOUNT_NUMBER: 'DEMO_111',
      }).demoAccountNumber(),
    ).toBe('DEMO_111');
  });
});
