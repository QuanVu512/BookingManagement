import { createHmac } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PayosSignatureService } from './payos-signature.service.js';

function serviceWithEnv(
  env: Record<string, string | undefined>,
): PayosSignatureService {
  const config = { get: (key: string) => env[key] } as ConfigService;
  return new PayosSignatureService(config);
}

/**
 * Ký kiểm thử sao đúng canonical của SDK (sort key + `key=value`),
 * độc lập với PayosDemoSigner để oracle chéo qua verifier SDK thật.
 */
function signForTest(
  data: Record<string, unknown>,
  checksumKey: string,
): string {
  const query = Object.keys(data)
    .sort()
    .map((key) => {
      const value = data[key];
      const normalized =
        value === null ||
        value === undefined ||
        value === 'null' ||
        value === 'undefined'
          ? ''
          : value;
      return `${key}=${normalized as string | number}`;
    })
    .join('&');
  return createHmac('sha256', checksumKey).update(query).digest('hex');
}

describe('PayosSignatureService (BE-PAY-07, MIG-06)', () => {
  it('fail-closed khi thiếu checksum key (MIG-20)', async () => {
    const service = serviceWithEnv({});
    expect(service.isConfigured()).toBe(false);
    await expect(
      service.verifyEnvelope({ data: {}, signature: 'x' }),
    ).rejects.toThrow('chưa được cấu hình');
  });

  it('từ chối envelope thiếu data/signature', async () => {
    const service = serviceWithEnv({
      PAYOS_CLIENT_ID: 'cid',
      PAYOS_API_KEY: 'key',
      PAYOS_CHECKSUM_KEY: 'checksum',
    });
    expect(service.isConfigured()).toBe(true);
    await expect(service.verifyEnvelope({})).rejects.toThrow('thiếu data');
    await expect(
      service.verifyEnvelope({ data: { orderCode: 1 } }),
    ).rejects.toThrow('thiếu data');
  });

  it('verify-only với checksum key đơn lẻ (deployment demo, F02/F06)', async () => {
    const checksumKey = 'demo-checksum-key-for-tests-only';
    const service = serviceWithEnv({ PAYOS_CHECKSUM_KEY: checksumKey });
    expect(service.isConfigured()).toBe(true);
    const data = {
      orderCode: 1000001,
      amount: 45000,
      description: 'DEMO PAY-ABCDEF123456 showcase',
      accountNumber: 'DEMO_888888',
      reference: 'PAY-ABCDEF123456',
      transactionDateTime: '2026-10-31 10:00:00',
      currency: 'VND',
      paymentLinkId: 'DEMO_PAY-ABCDEF123456',
      code: '00',
      desc: 'success',
    };
    const envelope = { data, signature: signForTest(data, checksumKey) };
    const verified = await service.verifyEnvelope(envelope);
    expect(verified).toMatchObject({ reference: 'PAY-ABCDEF123456' });
    await expect(
      service.verifyEnvelope({
        data: { ...data, amount: 145000 },
        signature: envelope.signature,
      }),
    ).rejects.toThrow('không hợp lệ');
  });

  it('chỉ chấp nhận signed code 00, outer success không thay thế', () => {
    const service = serviceWithEnv({});
    expect(
      service.isSignedSuccess({ orderCode: 1, amount: 1, code: '00' }),
    ).toBe(true);
    expect(
      service.isSignedSuccess({ orderCode: 1, amount: 1, code: '01' }),
    ).toBe(false);
    expect(service.isSignedSuccess({ orderCode: 1, amount: 1 })).toBe(false);
  });

  it('canonical identity chuẩn hóa chữ hoa/khoảng trắng', () => {
    const service = serviceWithEnv({});
    expect(
      service.canonicalIdentity({
        receivingAccountKey: ' payos:123456 ',
        transactionReference: ' ft23123abc ',
      }),
    ).toBe('PAYOS:123456::FT23123ABC');
    expect(() =>
      service.canonicalIdentity({
        receivingAccountKey: 'payos:1',
        transactionReference: null,
      }),
    ).toThrow();
  });
});
