import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { GuestRecoveryOutboxCrypto } from '../infrastructure/guest-recovery-outbox-crypto.js';
import { GuestRecoveryMailService } from '../infrastructure/guest-recovery-mail.service.js';

export const GUEST_RECOVERY_MAIL_CLAIM_BATCH = 5;
export const GUEST_RECOVERY_MAIL_MAX_PER_RUN = 100;
export const GUEST_RECOVERY_MAX_ATTEMPTS = 5;
export const GUEST_RECOVERY_STUCK_SENDING_MS = 2 * 60_000;
export const GUEST_RECOVERY_PURGE_AFTER_MS = 24 * 3600_000;
const GUEST_RECOVERY_BACKOFF_MS = [15_000, 30_000, 60_000, 120_000, 300_000];

export interface GuestRecoveryMailBatchResult {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  retried: number;
  purged: number;
}

interface ClaimedOutboxRow {
  id: string;
  aggregateId: string;
  eventType: string;
  payloadCiphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: string;
  status: string;
  attemptCount: number;
  expiresAt: Date;
}

/**
 * Worker gửi thư phục hồi giữ chỗ (Task 5.1, job `guest-recovery-mail`).
 * PostgreSQL là authority; BullMQ chỉ là trigger lịch.
 * - Claim từng cụm nhỏ (S5-03): mỗi vòng chỉ giữ vài job SENDING rồi gửi ngay,
 *   worker khác không reclaim được job của worker còn sống trong ngưỡng kẹt.
 * - Giờ kiểm hạn là giờ DB đọc lại ngay trước khi gửi từng thư (S5-02), không
 *   dùng giờ đầu batch; không gia hạn hold/token.
 * - Tombstone (đã purge) và job hết lượt không bao giờ bị claim lại (S5-05);
 *   job kết thúc cuối xóa nextRetryAt.
 * - Ciphertext giữ tới khi retention sweep (expiresAt + 24 giờ) mới purge,
 *   theo F6 canonical — không xóa ngay sau SENT.
 * - Lỗi SMTP không bao giờ hủy booking; lastError không chứa token (P5-08).
 */
@Injectable()
export class GuestRecoveryMailWorker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: GuestRecoveryOutboxCrypto,
    private readonly mail: GuestRecoveryMailService,
  ) {}

  async runOnce(now: Date = new Date()): Promise<GuestRecoveryMailBatchResult> {
    const result: GuestRecoveryMailBatchResult = {
      claimed: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
      retried: 0,
      purged: 0,
    };
    let processed = 0;
    for (;;) {
      const claimed = await this.claimDue(now);
      if (!claimed.length) break;
      result.claimed += claimed.length;
      for (const { id, attempt } of claimed) {
        const outcome = await this.processOne(id, attempt);
        if (outcome === 'sent') result.sent += 1;
        else if (outcome === 'skipped' || outcome === 'stale') result.skipped += 1;
        else if (outcome === 'failed') result.failed += 1;
        else result.retried += 1;
        processed += 1;
        if (processed >= GUEST_RECOVERY_MAIL_MAX_PER_RUN) break;
      }
      if (processed >= GUEST_RECOVERY_MAIL_MAX_PER_RUN) break;
    }
    result.purged = await this.purgeLeftovers(new Date());
    return result;
  }

  private async claimDue(now: Date): Promise<Array<{ id: string; attempt: number }>> {
    const stuckBefore = new Date(now.getTime() - GUEST_RECOVERY_STUCK_SENDING_MS);
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = (await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM outbox_messages
        WHERE purged_at IS NULL
          AND (
            (status = 'QUEUED' AND (next_retry_at IS NULL OR next_retry_at <= ${now}))
            OR (status = 'FAILED' AND next_retry_at IS NOT NULL AND next_retry_at <= ${now})
            OR (status = 'SENDING' AND updated_at < ${stuckBefore})
          )
        ORDER BY created_at ASC
        LIMIT ${GUEST_RECOVERY_MAIL_CLAIM_BATCH}
        FOR UPDATE SKIP LOCKED`) as Array<{ id: string }>;
      const ids = rows.map((row) => row.id);
      if (!ids.length) return [];
      const updated = await tx.outboxMessage.updateMany({
        where: {
          id: { in: ids },
          purgedAt: null,
          status: { in: ['QUEUED', 'FAILED', 'SENDING'] },
        },
        data: { status: 'SENDING', attemptCount: { increment: 1 } },
      });
      if (!updated.count) return [];
      const kept = await tx.outboxMessage.findMany({
        where: { id: { in: ids }, status: 'SENDING', purgedAt: null },
        select: { id: true, attemptCount: true },
      });
      return kept.map((row) => ({ id: row.id, attempt: row.attemptCount }));
    });
    return claimed;
  }

  private async databaseNow(): Promise<Date> {
    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    return clock.now;
  }

  private async processOne(
    id: string,
    claimedAttempt: number,
  ): Promise<'sent' | 'skipped' | 'failed' | 'retried' | 'stale'> {
    const row = (await this.prisma.outboxMessage.findUnique({
      where: { id },
    })) as ClaimedOutboxRow | null;
    if (!row || row.status !== 'SENDING') return 'skipped';
    if (row.attemptCount !== claimedAttempt) return 'stale';
    // S5-02: đọc lại giờ DB và đơn ngay trước khi gửi; đơn hết hạn giữa chừng
    // thì bỏ qua, tuyệt đối không gửi thư mời cho đơn đã hết hạn.
    const now = await this.databaseNow();
    const booking = await this.prisma.booking.findUnique({
      where: { id: row.aggregateId },
      select: {
        id: true,
        userId: true,
        status: true,
        holdExpiresAt: true,
        bookingCode: true,
        customerEmail: true,
        startsAt: true,
        endsAt: true,
        requiredPrepaymentAmount: true,
        court: { select: { name: true } },
      },
    });
    if (
      !booking ||
      booking.userId !== null ||
      booking.status !== 'HOLDING' ||
      now.getTime() >= booking.holdExpiresAt.getTime()
    ) {
      await this.finish(id, claimedAttempt, 'EXPIRED_SKIPPED', null, now);
      return 'skipped';
    }
    let payload: { bookingId: string; email: string; token: string };
    try {
      payload = this.decryptPayload(row);
    } catch {
      await this.finish(id, claimedAttempt, 'FAILED', 'DECRYPTION_FAILED', now);
      return 'failed';
    }
    if (payload.bookingId !== row.aggregateId) {
      await this.finish(id, claimedAttempt, 'FAILED', 'DECRYPTION_FAILED', now);
      return 'failed';
    }
    // S5-03: kiểm tra quyền sở hữu lease lần cuối NGAY TRƯỚC khi gửi. Nếu
    // worker khác đã reclaim (attemptCount đổi) thì touch thất bại → bỏ qua,
    // tuyệt đối không gửi thư sau khi mất claim.
    if (!(await this.touchLease(id, claimedAttempt, now))) return 'stale';
    try {
      await this.mail.sendRecoveryMail({
        to: payload.email,
        bookingCode: booking.bookingCode,
        courtName: booking.court?.name ?? '',
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        prepaymentAmount: Number(booking.requiredPrepaymentAmount),
        holdExpiresAt: booking.holdExpiresAt,
        token: payload.token,
        bookingId: booking.id,
      });
    } catch {
      if (row.attemptCount >= GUEST_RECOVERY_MAX_ATTEMPTS) {
        await this.finish(id, claimedAttempt, 'FAILED', 'SMTP_DELIVERY_FAILED', now);
        return 'failed';
      }
      const backoff =
        GUEST_RECOVERY_BACKOFF_MS[
          Math.min(row.attemptCount, GUEST_RECOVERY_BACKOFF_MS.length) - 1
        ] ?? GUEST_RECOVERY_BACKOFF_MS[0];
      // Ghi retry có điều kiện theo generation đã claim (S5-03).
      const requeued = await this.prisma.outboxMessage.updateMany({
        where: {
          id,
          status: 'SENDING',
          attemptCount: claimedAttempt,
          purgedAt: null,
        },
        data: {
          status: 'FAILED',
          nextRetryAt: new Date(now.getTime() + backoff),
          lastError: 'SMTP_DELIVERY_FAILED',
        },
      });
      if (requeued.count !== 1) return 'stale';
      return 'retried';
    }
    await this.finish(id, claimedAttempt, 'SENT', null, now);
    return 'sent';
  }

  /**
   * S5-03: heartbeat + kiểm tra quyền sở hữu lease. Chỉ worker đang giữ đúng
   * generation (attemptCount lúc claim) mới chạm được; worker khác reclaim sẽ
   * làm attemptCount đổi nên touch trả false → caller bỏ qua, không gửi.
   */
  private async touchLease(
    id: string,
    claimedAttempt: number,
    now: Date,
  ): Promise<boolean> {
    const touched = await this.prisma.outboxMessage.updateMany({
      where: {
        id,
        status: 'SENDING',
        attemptCount: claimedAttempt,
        purgedAt: null,
      },
      data: { updatedAt: now },
    });
    return touched.count === 1;
  }

  private decryptPayload(row: ClaimedOutboxRow): {
    bookingId: string;
    email: string;
    token: string;
  } {
    const plaintext = this.crypto.decrypt({
      ciphertext: Buffer.from(row.payloadCiphertext),
      iv: Buffer.from(row.iv),
      authTag: Buffer.from(row.authTag),
      keyVersion: row.keyVersion,
      bookingId: row.aggregateId,
      eventType: row.eventType,
    });
    const parsed: unknown = JSON.parse(plaintext);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as { bookingId?: unknown }).bookingId !== 'string' ||
      typeof (parsed as { email?: unknown }).email !== 'string' ||
      typeof (parsed as { token?: unknown }).token !== 'string' ||
      (parsed as { token?: string }).token!.length < 32
    ) {
      throw new Error('INVALID_RECOVERY_PAYLOAD');
    }
    return parsed as { bookingId: string; email: string; token: string };
  }

  private async finish(
    id: string,
    claimedAttempt: number,
    status: 'SENT' | 'EXPIRED_SKIPPED' | 'FAILED',
    lastError: string | null,
    now: Date,
  ): Promise<boolean> {
    // Job kết thúc cuối luôn xóa nextRetryAt để không bao giờ bị claim lại
    // (S5-05); ciphertext giữ tới retention sweep theo F6, không purge ở đây.
    // Conditional theo generation đã claim: worker mất lease không được
    // finalize (S5-03).
    const finalized = await this.prisma.outboxMessage.updateMany({
      where: {
        id,
        status: 'SENDING',
        attemptCount: claimedAttempt,
        purgedAt: null,
      },
      data: {
        status,
        ...(lastError === null ? { lastError: null } : { lastError }),
        ...(status === 'SENT' ? { sentAt: now } : {}),
        nextRetryAt: null,
      },
    });
    return finalized.count === 1;
  }

  private async purgeLeftovers(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - GUEST_RECOVERY_PURGE_AFTER_MS);
    const stale = await this.prisma.outboxMessage.findMany({
      where: {
        status: { in: ['SENT', 'EXPIRED_SKIPPED', 'FAILED'] },
        purgedAt: null,
        expiresAt: { lt: cutoff },
      },
      select: { id: true },
      take: 100,
    });
    if (!stale.length) return 0;
    const cleaned = await this.prisma.outboxMessage.updateMany({
      where: { id: { in: stale.map((row) => row.id) }, purgedAt: null },
      data: {
        payloadCiphertext: new Uint8Array(0),
        iv: new Uint8Array(0),
        authTag: new Uint8Array(0),
        purgedAt: now,
      },
    });
    return cleaned.count;
  }
}
