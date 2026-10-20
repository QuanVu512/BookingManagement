import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Mã hóa destination hoàn tiền (OD-12).
 * Key: REFUND_DESTINATION_KEY (hex 64 ký tự) riêng mỗi môi trường.
 * Chưa cấu hình key → chế độ last4-only (không persist số full).
 */
@Injectable()
export class RefundDestinationCrypto {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return this.key() !== null;
  }

  encrypt(plaintext: string): Buffer {
    const key = this.key();
    if (!key) throw new Error('ENCRYPTION_NOT_CONFIGURED');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, ciphertext]);
  }

  decrypt(blob: Buffer | Uint8Array): string {
    const key = this.key();
    if (!key) throw new Error('ENCRYPTION_NOT_CONFIGURED');
    const data = Buffer.from(blob);
    const iv = data.subarray(0, 12);
    const tag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }

  private key(): Buffer | null {
    const hex = this.config.get<string>('REFUND_DESTINATION_KEY');
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return null;
    return Buffer.from(hex, 'hex');
  }
}
