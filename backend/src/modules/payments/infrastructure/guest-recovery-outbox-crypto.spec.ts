import { ConfigService } from '@nestjs/config';
import {
  GuestRecoveryOutboxCrypto,
  guestRecoveryAad,
  parseGuestRecoveryOutboxKeys,
} from './guest-recovery-outbox-crypto.js';

const V1 = 'v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const V2 = 'v2:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';

function service(keys = `${V1},${V2}`, active = 'v1') {
  return new GuestRecoveryOutboxCrypto(
    new ConfigService({
      GUEST_RECOVERY_OUTBOX_KEYS: keys,
      GUEST_RECOVERY_ACTIVE_KEY_VERSION: active,
    } as Record<string, string>),
  );
}

describe('GuestRecoveryOutboxCrypto (mã hóa thư phục hồi AES-256-GCM)', () => {
  it('phân tích được nhiều phiên bản khóa để xoay khóa', () => {
    const ring = parseGuestRecoveryOutboxKeys(`${V1}, ${V2}`);
    expect(ring.map((entry) => entry.version)).toEqual(['v1', 'v2']);
    expect(ring[0].key).toHaveLength(32);
  });

  it('từ chối chuỗi khóa sai định dạng', () => {
    expect(parseGuestRecoveryOutboxKeys('v1:not-hex')).toEqual([]);
    expect(parseGuestRecoveryOutboxKeys('')).toEqual([]);
    expect(parseGuestRecoveryOutboxKeys(undefined)).toEqual([]);
  });

  it('mã hóa rồi giải mã tròn quanh với khóa đang dùng', () => {
    const crypto = service();
    expect(crypto.isConfigured()).toBe(true);
    const record = crypto.encrypt('{"bookingId":"bk-1"}', {
      bookingId: 'bk-1',
      eventType: 'guest.recovery.invite',
    });
    expect(record.keyVersion).toBe('v1');
    expect(record.iv).toHaveLength(12);
    expect(record.authTag).toHaveLength(16);
    expect(
      crypto.decrypt({
        ...record,
        bookingId: 'bk-1',
        eventType: 'guest.recovery.invite',
      }),
    ).toBe('{"bookingId":"bk-1"}');
  });

  it('mã hóa bằng phiên bản khóa chỉ định khi xoay khóa', () => {
    const crypto = service(`${V1},${V2}`, 'v2');
    const record = crypto.encrypt('payload', {
      bookingId: 'bk-1',
      eventType: 'guest.recovery.invite',
    });
    expect(record.keyVersion).toBe('v2');
    expect(
      crypto.decrypt({
        ...record,
        bookingId: 'bk-1',
        eventType: 'guest.recovery.invite',
      }),
    ).toBe('payload');
  });

  it('thất bại khi sửa 1 byte ciphertext (P5-01 chống giả mạo)', () => {
    const crypto = service();
    const record = crypto.encrypt('secret-link', {
      bookingId: 'bk-1',
      eventType: 'guest.recovery.invite',
    });
    const tampered = Buffer.from(record.ciphertext);
    tampered[0] ^= 0x01;
    expect(() =>
      crypto.decrypt({
        ...record,
        ciphertext: tampered,
        bookingId: 'bk-1',
        eventType: 'guest.recovery.invite',
      }),
    ).toThrow();
  });

  it('thất bại khi ghép ciphertext sang đơn khác (ràng buộc aad)', () => {
    const crypto = service();
    const record = crypto.encrypt('secret-link', {
      bookingId: 'bk-1',
      eventType: 'guest.recovery.invite',
    });
    expect(() =>
      crypto.decrypt({ ...record, bookingId: 'bk-2', eventType: 'guest.recovery.invite' }),
    ).toThrow();
    expect(guestRecoveryAad('bk-1', 'guest.recovery.invite')).not.toEqual(
      guestRecoveryAad('bk-2', 'guest.recovery.invite'),
    );
  });

  it('thất bại khi phiên bản khóa không còn trong vòng khóa', () => {
    const crypto = service();
    const record = crypto.encrypt('x', {
      bookingId: 'bk-1',
      eventType: 'guest.recovery.invite',
    });
    expect(() =>
      crypto.decrypt({ ...record, keyVersion: 'v9' }),
    ).toThrow(/UNKNOWN_KEY_VERSION/);
  });

  it('thiếu khóa thì báo chưa cấu hình, không chặn ở tầng kiểm tra (Q3)', () => {
    const crypto = service('', 'v1');
    expect(crypto.isConfigured()).toBe(false);
    expect(() =>
      crypto.encrypt('x', { bookingId: 'bk-1', eventType: 'guest.recovery.invite' }),
    ).toThrow(/ENCRYPTION_NOT_CONFIGURED/);
  });
});
