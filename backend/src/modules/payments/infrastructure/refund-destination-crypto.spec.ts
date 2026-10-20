import { randomBytes } from 'node:crypto';
import { RefundDestinationCrypto } from './refund-destination-crypto.js';

function cryptoWith(key: string | undefined): RefundDestinationCrypto {
  const config = { get: (name: string) => (name === 'REFUND_DESTINATION_KEY' ? key : undefined) };
  return new RefundDestinationCrypto(config as never);
}

describe('RefundDestinationCrypto (OD-12)', () => {
  it('roundtrip AES-256-GCM khi có key', () => {
    const crypto = cryptoWith(randomBytes(32).toString('hex'));
    expect(crypto.isConfigured()).toBe(true);
    const blob = crypto.encrypt('9704221234567890');
    expect(blob).not.toContain('9704221234567890');
    expect(crypto.decrypt(blob)).toBe('9704221234567890');
  });

  it('mỗi lần mã hóa khác nhau (IV ngẫu nhiên)', () => {
    const crypto = cryptoWith(randomBytes(32).toString('hex'));
    expect(crypto.encrypt('1234').equals(crypto.encrypt('1234'))).toBe(false);
  });

  it('thiếu key → last4-only mode', () => {
    const crypto = cryptoWith(undefined);
    expect(crypto.isConfigured()).toBe(false);
    expect(() => crypto.encrypt('1234')).toThrow('ENCRYPTION_NOT_CONFIGURED');
    const bad = cryptoWith('short');
    expect(bad.isConfigured()).toBe(false);
  });
});
