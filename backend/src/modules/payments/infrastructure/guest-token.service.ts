import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { CHECKOUT_RECOVERY_TOKEN_TTL_MS } from '../domain/guest-checkout-token-policy.js';

/**
 * E3 — Guest access token lifecycle (MIG-11).
 * - CSPRNG ≥256 bit, chỉ lưu SHA-256 hash ở DB, raw token trả một lần.
 * - Bind purpose + booking; KHÔNG revoke khi cancel (giữ xem refund);
 *   expiry hữu hạn theo cấu hình OD-04 (mặc định 30 ngày từ startsAt).
 * - Cấp lại (E13) chỉ cho booking guest, revoke cũ + audit ở caller.
 * - Biết bookingCode/phone/last4 KHÔNG đủ để cấp token mới.
 */
export interface GuestTokenVerification {
  bookingId: string;
  tokenId: string;
}

export type CheckoutTokenVerification =
  | {
      ok: true;
      bookingId: string;
      tokenId: string;
      expiresAt: Date;
    }
  | {
      ok: false;
      reason: 'INVALID' | 'EXPIRED' | 'BOOKING_MISMATCH';
    };

@Injectable()
export class GuestTokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  ttlDays(): number {
    const raw = Number(
      this.config.get<string>('GUEST_MANAGE_TOKEN_TTL_DAYS') ?? '30',
    );
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 90) : 30;
  }

  /**
   * P3-1 — mọi so hạn của checkout token dùng clock_timestamp của PostgreSQL,
   * transaction-aware, thay vì đồng hồ process để nhất quán với guard/DB.
   */
  private async databaseNow(
    transaction?: TransactionContext,
  ): Promise<Date> {
    const [clock] = transaction
      ? await transaction.$queryRaw<{ now: Date }[]>`
          SELECT clock_timestamp() AS now`
      : await this.prisma.$queryRaw<{ now: Date }[]>`
          SELECT clock_timestamp() AS now`;
    return clock.now;
  }

  async issueManageToken(input: {
    bookingId: string;
    startsAt: Date;
  }): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const base = Math.max(input.startsAt.getTime(), Date.now());
    const expiresAt = new Date(base + this.ttlDays() * 86_400_000);
    const created = await this.prisma.bookingAccessToken.create({
      data: {
        bookingId: input.bookingId,
        purpose: 'MANAGE_BOOKING',
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });
    return { rawToken, tokenId: created.id, expiresAt };
  }

  /**
   * Contract F2 — CheckoutRecoveryToken sống cố định 10 phút kể từ hold gốc.
   * Không nhận TTL từ request; replay/resume không gia hạn. Raw token chỉ trả
   * một lần cho caller, DB giữ SHA-256.
   */
  async issueCheckoutToken(input: {
    bookingId: string;
    holdIssuedAt: Date;
    transaction?: TransactionContext;
  }): Promise<{ rawToken: string; tokenId: string; expiresAt: Date }> {
    const expiresAt = new Date(
      input.holdIssuedAt.getTime() + CHECKOUT_RECOVERY_TOKEN_TTL_MS,
    );
    const now = await this.databaseNow(input.transaction);
    if (!(expiresAt.getTime() > now.getTime())) {
      throw new UnauthorizedException({
        code: 'RECOVERY_TOKEN_EXPIRED',
        message: 'Liên kết khôi phục đã hết hạn. Vui lòng đặt lại đơn mới.',
      });
    }
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const data = {
      bookingId: input.bookingId,
      purpose: 'CHECKOUT_RECOVERY' as const,
      tokenHash,
      expiresAt,
    };
    const created = input.transaction
      ? await input.transaction.bookingAccessToken.create({
          data,
          select: { id: true },
        })
      : await this.prisma.bookingAccessToken.create({
          data,
          select: { id: true },
        });
    return { rawToken, tokenId: created.id, expiresAt };
  }

  /**
   * Xác thực checkout token và binding booking. Phân biệt expired với invalid
   * để guard trả đúng RECOVERY_TOKEN_EXPIRED (AC-16) mà không lộ token khác.
   */
  async verifyCheckoutToken(
    rawToken: string,
    bookingId: string,
  ): Promise<CheckoutTokenVerification> {
    if (typeof rawToken !== 'string' || rawToken.length < 32) {
      return { ok: false, reason: 'INVALID' };
    }
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const row = await this.prisma.bookingAccessToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        bookingId: true,
        purpose: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (!row || row.purpose !== 'CHECKOUT_RECOVERY') {
      return { ok: false, reason: 'INVALID' };
    }
    if (row.revokedAt !== null) return { ok: false, reason: 'INVALID' };
    const now = await this.databaseNow();
    if (!(row.expiresAt.getTime() > now.getTime())) {
      return { ok: false, reason: 'EXPIRED' };
    }
    if (!sameBookingId(row.bookingId, bookingId)) {
      return { ok: false, reason: 'BOOKING_MISMATCH' };
    }
    return {
      ok: true,
      bookingId: row.bookingId,
      tokenId: row.id,
      expiresAt: row.expiresAt,
    };
  }

  async verifyManageToken(
    rawToken: string,
    bookingId: string,
  ): Promise<GuestTokenVerification | null> {
    if (typeof rawToken !== 'string' || rawToken.length < 32) return null;
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const row = await this.prisma.bookingAccessToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        bookingId: true,
        purpose: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
    if (!row || row.purpose !== 'MANAGE_BOOKING') return null;
    if (row.revokedAt !== null) return null;
    if (!(row.expiresAt.getTime() > Date.now())) return null;
    if (!sameBookingId(row.bookingId, bookingId)) return null;
    return { bookingId: row.bookingId, tokenId: row.id };
  }

  async revokeToken(tokenId: string): Promise<void> {
    await this.prisma.bookingAccessToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

function sameBookingId(stored: string, requested: string): boolean {
  // P3-2 — path param UUID có thể viết hoa; PostgreSQL uuid không phân biệt
  // hoa/thường nên so sánh cũng phải chuẩn hóa trước khi timing-safe compare.
  const expected = Buffer.from(stored.toLowerCase());
  const actual = Buffer.from(requested.toLowerCase());
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
