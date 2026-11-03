import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hóa thư phục hồi khách vãng lai cho bảng OutboxMessage (Task 5.1).
 * AES-256-GCM, nonce 12 byte duy nhất mỗi bản ghi, tag 16 byte, lưu tách
 * cột iv/authTag/keyVersion (không gói blob như refund crypto).
 * Khóa: GUEST_RECOVERY_OUTBOX_KEYS dạng "v1:<hex64>,v2:<hex64>" để xoay khóa;
 * bản đang dùng: GUEST_RECOVERY_ACTIVE_KEY_VERSION. aad = bookingId|eventType
 * chống ghép ciphertext sang đơn khác. Không log plaintext/token.
 */
export interface GuestRecoveryOutboxKey {
  version: string;
  key: Buffer;
}

export interface GuestRecoveryEncryptedRecord {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: string;
}

const KEY_ENTRY_PATTERN = /^([A-Za-z0-9_-]{1,30}):([0-9a-fA-F]{64})$/;

export function parseGuestRecoveryOutboxKeys(
  raw: string | undefined,
): GuestRecoveryOutboxKey[] {
  if (!raw) return [];
  const entries: GuestRecoveryOutboxKey[] = [];
  for (const part of raw.split(',')) {
    const match = KEY_ENTRY_PATTERN.exec(part.trim());
    if (!match) continue;
    if (entries.some((entry) => entry.version === match[1])) continue;
    entries.push({ version: match[1], key: Buffer.from(match[2], 'hex') });
  }
  return entries;
}

export function guestRecoveryAad(bookingId: string, eventType: string): Buffer {
  return Buffer.from(`${bookingId}|${eventType}`, 'utf8');
}

@Injectable()
export class GuestRecoveryOutboxCrypto {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.activeEntry() !== null;
  }

  activeKeyVersion(): string | null {
    return this.activeEntry()?.version ?? null;
  }

  private activeEntry(): GuestRecoveryOutboxKey | null {
    const ring = parseGuestRecoveryOutboxKeys(
      this.config.get<string>('GUEST_RECOVERY_OUTBOX_KEYS'),
    );
    const active =
      this.config.get<string>('GUEST_RECOVERY_ACTIVE_KEY_VERSION') ??
      ring[0]?.version;
    return ring.find((item) => item.version === active) ?? null;
  }

  encrypt(
    plaintext: string,
    context: { bookingId: string; eventType: string; keyVersion?: string },
  ): GuestRecoveryEncryptedRecord {
    const ring = parseGuestRecoveryOutboxKeys(
      this.config.get<string>('GUEST_RECOVERY_OUTBOX_KEYS'),
    );
    const version =
      context.keyVersion ??
      this.config.get<string>('GUEST_RECOVERY_ACTIVE_KEY_VERSION') ??
      ring[0]?.version;
    const entry = ring.find((item) => item.version === version) ?? null;
    if (!entry) throw new Error('ENCRYPTION_NOT_CONFIGURED');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', entry.key, iv);
    cipher.setAAD(guestRecoveryAad(context.bookingId, context.eventType));
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    return {
      ciphertext,
      iv,
      authTag: cipher.getAuthTag(),
      keyVersion: entry.version,
    };
  }

  decrypt(
    record: GuestRecoveryEncryptedRecord & {
      bookingId: string;
      eventType: string;
    },
  ): string {
    const ring = parseGuestRecoveryOutboxKeys(
      this.config.get<string>('GUEST_RECOVERY_OUTBOX_KEYS'),
    );
    const entry = ring.find((item) => item.version === record.keyVersion) ?? null;
    if (!entry) throw new Error('UNKNOWN_KEY_VERSION');
    try {
      const decipher = createDecipheriv('aes-256-gcm', entry.key, record.iv);
      decipher.setAuthTag(record.authTag);
      decipher.setAAD(guestRecoveryAad(record.bookingId, record.eventType));
      return Buffer.concat([
        decipher.update(record.ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('DECRYPTION_FAILED');
    }
  }
}
