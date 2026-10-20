import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

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
    // So sánh booking binding bằng timing-safe compare trên hash.
    const expected = Buffer.from(row.bookingId);
    const actual = Buffer.from(bookingId);
    if (expected.length !== actual.length) return null;
    if (!timingSafeEqual(expected, actual)) return null;
    return { bookingId: row.bookingId, tokenId: row.id };
  }

  async revokeToken(tokenId: string): Promise<void> {
    await this.prisma.bookingAccessToken.updateMany({
      where: { id: tokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
