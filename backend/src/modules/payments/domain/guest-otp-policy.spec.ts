import { describe, expect, it } from '@jest/globals';
import {
  GUEST_OTP_MAX_ATTEMPTS,
  GUEST_OTP_PROOF_PREFIX,
  GUEST_OTP_RESEND_COOLDOWN_MS,
  guestOtpResendRetryAfterSeconds,
  generateGuestOtpProof,
  hashGuestOtpCode,
  hashGuestProofToken,
  hashGuestRecoverySecret,
  inspectGuestOtpChallenge,
  safeEqualHex,
} from './guest-otp-policy.js';

describe('guest-otp-policy', () => {
  const now = new Date('2026-10-29T10:00:00.000Z');

  it('keeps a fresh challenge usable and rejects expired/exhausted ones', () => {
    expect(
      inspectGuestOtpChallenge(
        {
          attempts: 0,
          expiresAt: new Date(now.getTime() + 60_000),
          consumedAt: null,
          invalidatedAt: null,
        },
        now,
      ),
    ).toEqual({ usable: true, expired: false, exhausted: false });

    expect(
      inspectGuestOtpChallenge(
        {
          attempts: 0,
          expiresAt: now,
          consumedAt: null,
          invalidatedAt: null,
        },
        now,
      ).usable,
    ).toBe(false);

    expect(
      inspectGuestOtpChallenge(
        {
          attempts: GUEST_OTP_MAX_ATTEMPTS,
          expiresAt: new Date(now.getTime() + 60_000),
          consumedAt: null,
          invalidatedAt: null,
        },
        now,
      ).exhausted,
    ).toBe(true);
  });

  it('computes resend cooldown seconds from the last challenge', () => {
    expect(
      guestOtpResendRetryAfterSeconds(
        new Date(now.getTime() - GUEST_OTP_RESEND_COOLDOWN_MS + 15_000),
        now,
      ),
    ).toBe(15);
    expect(
      guestOtpResendRetryAfterSeconds(
        new Date(now.getTime() - GUEST_OTP_RESEND_COOLDOWN_MS),
        now,
      ),
    ).toBe(0);
    expect(guestOtpResendRetryAfterSeconds(null, now)).toBe(0);
  });

  it('generates opaque proof tokens and stable hashes', () => {
    const proof = generateGuestOtpProof();
    expect(proof.startsWith(GUEST_OTP_PROOF_PREFIX)).toBe(true);
    expect(proof).toHaveLength(GUEST_OTP_PROOF_PREFIX.length + 64);
    expect(hashGuestProofToken(proof)).toMatch(/^[0-9a-f]{64}$/);

    const codeHash = hashGuestOtpCode(
      'guest@example.test',
      'GUEST_HOLD_CREATE',
      '123456',
    );
    expect(codeHash).toBe(
      hashGuestOtpCode('guest@example.test', 'GUEST_HOLD_CREATE', '123456'),
    );
    expect(codeHash).not.toBe(
      hashGuestOtpCode('other@example.test', 'GUEST_HOLD_CREATE', '123456'),
    );

    const secretHash = hashGuestRecoverySecret('x'.repeat(32));
    expect(safeEqualHex(secretHash, secretHash)).toBe(true);
    expect(safeEqualHex(secretHash, '0'.repeat(64))).toBe(false);
    expect(safeEqualHex('bad', secretHash)).toBe(false);
  });
});
