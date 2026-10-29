import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { MINUTE_MS } from '../../bookings/booking.constants.js';

/**
 * Bước 2 — policy OTP guest checkout.
 *
 * OTP challenge lưu PostgreSQL, chỉ hash 6 số. Code thô chỉ tồn tại trong
 * memory đủ lâu để gửi email và không bao giờ được log/trả về API.
 * Proof OTP là opaque CSPRNG (không phải JWT/HMAC): PostgreSQL là authority
 * theo Contract F1, token_hash chỉ để tra proof và conditional consume.
 */
export const GUEST_OTP_PURPOSE = 'GUEST_HOLD_CREATE';
export const GUEST_OTP_CODE_TTL_MS = 5 * MINUTE_MS;
export const GUEST_OTP_MAX_ATTEMPTS = 5;
export const GUEST_OTP_RESEND_COOLDOWN_MS = 60_000;
export const GUEST_OTP_PROOF_TTL_MS = 5 * MINUTE_MS;
export const GUEST_OTP_PROOF_PREFIX = 'gop_';

export interface GuestOtpChallengeFacts {
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
}

export interface GuestOtpChallengeUsability {
  usable: boolean;
  expired: boolean;
  exhausted: boolean;
}

export function inspectGuestOtpChallenge(
  facts: GuestOtpChallengeFacts,
  now: Date,
): GuestOtpChallengeUsability {
  const expired = facts.expiresAt.getTime() <= now.getTime();
  const exhausted = facts.attempts >= GUEST_OTP_MAX_ATTEMPTS;
  return {
    usable:
      !expired &&
      !exhausted &&
      facts.consumedAt === null &&
      facts.invalidatedAt === null,
    expired,
    exhausted,
  };
}

export function guestOtpResendRetryAfterSeconds(
  lastCreatedAt: Date | null,
  now: Date,
): number {
  if (!lastCreatedAt) return 0;
  const elapsed = now.getTime() - lastCreatedAt.getTime();
  if (elapsed >= GUEST_OTP_RESEND_COOLDOWN_MS) return 0;
  return Math.ceil(
    (GUEST_OTP_RESEND_COOLDOWN_MS - elapsed) / 1000,
  );
}

export function generateGuestOtpCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function generateGuestOtpProof(): string {
  return `${GUEST_OTP_PROOF_PREFIX}${randomBytes(32).toString('hex')}`;
}

export function hashGuestOtpCode(
  email: string,
  purpose: string,
  code: string,
): string {
  return createHash('sha256')
    .update(`${purpose}:${email}:${code}`, 'utf8')
    .digest('hex');
}

export function hashGuestProofToken(rawProof: string): string {
  return createHash('sha256').update(rawProof, 'utf8').digest('hex');
}

export function hashGuestRecoverySecret(rawSecret: string): string {
  return createHash('sha256').update(rawSecret, 'utf8').digest('hex');
}

/**
 * So sánh hai hex digest 64 ký tự bằng timing-safe compare. Trả false thay vì
 * ném lỗi khi input sai định dạng để caller không lộ khác biệt thời gian.
 */
export function safeEqualHex(left: string, right: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(left) || !/^[0-9a-f]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(left, 'hex'),
    Buffer.from(right, 'hex'),
  );
}
