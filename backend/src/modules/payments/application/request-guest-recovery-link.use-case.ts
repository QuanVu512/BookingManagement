import { Injectable, Logger, Optional } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { GuestTokenService } from '../infrastructure/guest-token.service.js';
import {
  GuestRecoveryOutboxWriter,
  type GuestRecoveryOutboxEventType,
} from './guest-recovery-outbox.writer.js';
import {
  LOOKUP_FANOUT_MAX_RECIPIENTS,
  GUEST_LOOKUP_GENERIC_MESSAGE,
} from '../domain/guest-lookup-fanout-policy.js';
import {
  normalizeGuestEmail,
  normalizeGuestPhone,
} from '../domain/guest-checkout-fingerprint.js';

export const GUEST_LOOKUP_RECIPIENT_MAX_PER_WINDOW = 3;
export const GUEST_LOOKUP_RECIPIENT_WINDOW_MS = 15 * 60_000;
export const GUEST_LOOKUP_IP_MAX_PER_WINDOW = 3;
export const GUEST_LOOKUP_IP_WINDOW_MS = 15 * 60_000;
export const GUEST_LOOKUP_DEDUP_BUCKET_MS = 2 * 60_000;

/**
 * S5-04: quota bộ nhớ dự phòng khi Redis không dùng được — vẫn giới hạn đúng
 * 3 lượt/3 thư mỗi 15 phút trong tiến trình này (fail-closed có giới hạn),
 * thay vì cho qua không giới hạn. Đa tiến trình vẫn cần Redis để chính xác.
 */
export class GuestLookupMemoryQuota {
  private readonly windows = new Map<string, number[]>();

  consume(key: string, limit: number, windowMs: number, nowMs: number): boolean {
    const cutoff = nowMs - windowMs;
    const kept = (this.windows.get(key) ?? []).filter((at) => at > cutoff);
    if (kept.length >= limit) {
      this.windows.set(key, kept);
      return false;
    }
    kept.push(nowMs);
    this.windows.set(key, kept);
    return true;
  }
}

/**
 * Tra cứu đơn giữ chỗ cho khách vãng lai (Task 5.3, AC-22 chống dò).
 * - Input là SĐT hoặc email; chuẩn hóa bằng cùng helper khi tạo giữ chỗ.
 * - Luôn trả đúng một thông báo chung, kể cả khi không tìm thấy, vượt giới
 *   hạn, hay Redis/token lỗi — không bao giờ lộ có/không có đơn.
 * - Mỗi đơn HOLDING còn hạn được cấp token mới (hạn neo giờ tạo giữ chỗ,
 *   không gia hạn) và ghi outbox `guest.recovery.lookup` trong cùng transaction.
 * - Giới hạn Q4/S5-04/S5-06: tối đa 3 lượt/15 phút theo IP (trong code để trả
 *   202 generic thay vì 429 của guard) và 3 thư/15 phút cho mỗi email nhận,
 *   tính theo từng thư thực tế gửi đi (một đơn = một lần đếm). Redis lỗi thì
 *   cho qua kèm cảnh báo (fail-open đã ghi nhận) thay vì chặn tra cứu.
 */
@Injectable()
export class RequestGuestRecoveryLinkUseCase {
  private readonly logger = new Logger(RequestGuestRecoveryLinkUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: GuestTokenService,
    private readonly outbox: GuestRecoveryOutboxWriter,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private readonly memoryQuota = new GuestLookupMemoryQuota();

  async execute(contact: string, clientIp?: string): Promise<{ message: string }> {
    const generic = { message: GUEST_LOOKUP_GENERIC_MESSAGE };
    if (clientIp && !(await this.consumeIpQuota(clientIp))) return generic;
    const normalized = this.normalizeContact(contact);
    if (!normalized) return generic;
    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    const now = clock.now;
    const bookings = await this.prisma.booking.findMany({
      where: {
        userId: null,
        status: 'HOLDING',
        holdExpiresAt: { gt: now },
        ...(normalized.kind === 'email'
          ? { customerEmail: normalized.value }
          : { customerPhone: normalized.value }),
      },
      select: {
        id: true,
        createdAt: true,
        customerEmail: true,
        holdExpiresAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    const groups = new Map<string, typeof bookings>();
    for (const booking of bookings) {
      let email: string;
      try {
        email = normalizeGuestEmail(booking.customerEmail);
      } catch {
        continue;
      }
      const list = groups.get(email);
      if (list) list.push(booking);
      else groups.set(email, [booking]);
    }
    const recipients = [...groups.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .slice(0, LOOKUP_FANOUT_MAX_RECIPIENTS);
    for (const [email, holds] of recipients) {
      for (const hold of holds) {
        // S5-04: quota tính theo từng thư thực tế, không phải từng nhóm.
        if (!(await this.consumeRecipientQuota(email))) break;
        await this.inviteForBooking(hold.id, hold.createdAt, email, hold.holdExpiresAt, now);
      }
    }
    return generic;
  }

  private normalizeContact(
    contact: string,
  ): { kind: 'email' | 'phone'; value: string } | null {
    const trimmed = (contact ?? '').trim();
    if (trimmed.length < 3 || trimmed.length > 150) return null;
    if (trimmed.includes('@')) {
      try {
        return { kind: 'email', value: normalizeGuestEmail(trimmed) };
      } catch {
        return null;
      }
    }
    try {
      return { kind: 'phone', value: normalizeGuestPhone(trimmed) };
    } catch {
      return null;
    }
  }

  private quotaKey(prefix: string, value: string): string {
    return `guest:recovery:lookup:${prefix}:${createHash('sha256').update(value).digest('hex')}`;
  }

  private async consumeQuota(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const nowMs = Date.now();
    if (this.redis) {
      try {
        const count = await this.redis.client.incr(key);
        if (count === 1) {
          try {
            await this.redis.client.expire(key, Math.ceil(windowMs / 1000));
            return count <= limit;
          } catch {
            // EXPIRE lỗi: xóa key để tránh key không TTL, rồi dùng fallback
            // bộ nhớ cho lượt này (vẫn giữ giới hạn).
            try {
              await this.redis.client.del(key);
            } catch {
              // Bỏ qua lỗi dọn dẹp.
            }
          }
        } else {
          return count <= limit;
        }
      } catch {
        this.logger.warn(
          'Redis tra cứu không khả dụng: dùng quota bộ nhớ dự phòng.',
        );
      }
    }
    // S5-04: Redis thiếu/lỗi thì dùng quota bộ nhớ trong tiến trình (vẫn chặn
    // vượt 3), thay vì cho qua không giới hạn.
    return this.memoryQuota.consume(key, limit, windowMs, nowMs);
  }

  private consumeRecipientQuota(email: string): Promise<boolean> {
    return this.consumeQuota(
      this.quotaKey('rcpt', email),
      GUEST_LOOKUP_RECIPIENT_MAX_PER_WINDOW,
      GUEST_LOOKUP_RECIPIENT_WINDOW_MS,
    );
  }

  private consumeIpQuota(ip: string): Promise<boolean> {
    return this.consumeQuota(
      this.quotaKey('ip', ip),
      GUEST_LOOKUP_IP_MAX_PER_WINDOW,
      GUEST_LOOKUP_IP_WINDOW_MS,
    );
  }

  private async inviteForBooking(
    bookingId: string,
    holdIssuedAt: Date,
    email: string,
    holdExpiresAt: Date,
    now: Date,
  ): Promise<void> {
    if (now.getTime() >= holdExpiresAt.getTime()) return;
    const eventType: GuestRecoveryOutboxEventType = 'guest.recovery.lookup';
    const bucket = Math.floor(now.getTime() / GUEST_LOOKUP_DEDUP_BUCKET_MS);
    try {
      await this.prisma.$transaction(async (transaction) => {
        const checkout = await this.tokens.issueCheckoutToken({
          bookingId,
          holdIssuedAt,
          transaction,
        });
        await this.outbox.writeInTransaction(transaction, {
          bookingId,
          email,
          token: checkout.rawToken,
          eventType,
          expiresAt: holdExpiresAt,
          dedupBucket: String(bucket),
        });
      });
    } catch {
      // Token hết hạn/khóa thiếu/trùng dedup: giữ im lặng theo AC-22, đơn và
      // các email khác không bị ảnh hưởng. Không log token/email.
      return;
    }
  }
}
