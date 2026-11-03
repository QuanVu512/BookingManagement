import { Injectable, Logger } from '@nestjs/common';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { GuestRecoveryOutboxCrypto } from '../infrastructure/guest-recovery-outbox-crypto.js';

export type GuestRecoveryOutboxEventType =
  | 'guest.recovery.invite'
  | 'guest.recovery.lookup';

export interface GuestRecoveryOutboxInput {
  bookingId: string;
  email: string;
  token: string;
  eventType: GuestRecoveryOutboxEventType;
  /** Hạn giữ chỗ của đơn; worker bỏ qua thư khi đã qua hạn. */
  expiresAt: Date;
  /** Khung chống trùng cho lookup (ví dụ phút chẵn 2 phút); invite bỏ qua. */
  dedupBucket?: string;
}

export type GuestRecoveryOutboxResult =
  | 'QUEUED'
  | 'DEDUPED'
  | 'SKIPPED_UNCONFIGURED';

export function guestRecoveryDeduplicationKey(input: {
  eventType: GuestRecoveryOutboxEventType;
  bookingId: string;
  dedupBucket?: string;
}): string {
  const base = `${input.eventType}:${input.bookingId}`;
  return input.dedupBucket ? `${base}:${input.dedupBucket}` : base;
}

/**
 * Prisma Bytes nhận Uint8Array<ArrayBuffer>; sao chép rõ sang ArrayBuffer mới
 * để khớp kiểu generated client.
 */
export function toBytes(value: Buffer | Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new ArrayBuffer(value.byteLength);
  new Uint8Array(copy).set(value);
  return new Uint8Array(copy);
}

/**
 * Ghi thư phục hồi vào OutboxMessage trong cùng transaction giữ chỗ/tra cứu
 * (Task 5.1). Thiếu khóa mã hóa → bỏ qua + cảnh báo, KHÔNG chặn nghiệp vụ
 * chính (Q3: đặt sân vẫn thành công). Replay dùng dedup key nên không ghi trùng.
 */
@Injectable()
export class GuestRecoveryOutboxWriter {
  private readonly logger = new Logger(GuestRecoveryOutboxWriter.name);

  constructor(private readonly crypto: GuestRecoveryOutboxCrypto) {}

  async writeInTransaction(
    transaction: TransactionContext,
    input: GuestRecoveryOutboxInput,
  ): Promise<GuestRecoveryOutboxResult> {
    if (!this.crypto.isConfigured()) {
      this.logger.warn(
        'GUEST_RECOVERY_OUTBOX_KEYS chưa cấu hình: bỏ qua email phục hồi, giữ chỗ vẫn hiệu lực.',
      );
      return 'SKIPPED_UNCONFIGURED';
    }
    const payload = JSON.stringify({
      v: 1,
      bookingId: input.bookingId,
      email: input.email,
      token: input.token,
      eventType: input.eventType,
    });
    const encrypted = this.crypto.encrypt(payload, {
      bookingId: input.bookingId,
      eventType: input.eventType,
    });
    try {
      await transaction.outboxMessage.create({
        data: {
          aggregateType: 'BOOKING',
          aggregateId: input.bookingId,
          eventType: input.eventType,
          payloadCiphertext: toBytes(encrypted.ciphertext),
          iv: toBytes(encrypted.iv),
          authTag: toBytes(encrypted.authTag),
          keyVersion: encrypted.keyVersion,
          deduplicationKey: guestRecoveryDeduplicationKey(input),
          status: 'QUEUED',
          expiresAt: input.expiresAt,
        },
        select: { id: true },
      });
      return 'QUEUED';
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        return 'DEDUPED';
      }
      throw error;
    }
  }
}
