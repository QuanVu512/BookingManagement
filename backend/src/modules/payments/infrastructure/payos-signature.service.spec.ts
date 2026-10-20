import { ConfigService } from '@nestjs/config';
import { PayosSignatureService } from './payos-signature.service.js';

function serviceWithEnv(
  env: Record<string, string | undefined>,
): PayosSignatureService {
  const config = { get: (key: string) => env[key] } as ConfigService;
  return new PayosSignatureService(config);
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

  it('chỉ chấp nhận signed code 00, outer success không thay thế', () => {
    const service = serviceWithEnv({});
    expect(service.isSignedSuccess({ orderCode: 1, amount: 1, code: '00' })).toBe(
      true,
    );
    expect(service.isSignedSuccess({ orderCode: 1, amount: 1, code: '01' })).toBe(
      false,
    );
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
