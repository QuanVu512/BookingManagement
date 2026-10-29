import { BadRequestException, Injectable } from '@nestjs/common';
import {
  GUEST_OTP_MAX_ATTEMPTS,
  GUEST_OTP_PROOF_TTL_MS,
  GUEST_OTP_PURPOSE,
  generateGuestOtpProof,
  hashGuestOtpCode,
  hashGuestProofToken,
  inspectGuestOtpChallenge,
  safeEqualHex,
} from '../domain/guest-otp-policy.js';
import {
  GuestCheckoutPayloadError,
  normalizeGuestEmail,
} from '../domain/guest-checkout-fingerprint.js';
import { GuestCheckoutStore } from '../ports/guest-checkout-store.js';

export interface VerifyGuestOtpInput {
  email: string;
  code: string;
}

export interface VerifyGuestOtpResult {
  verified: true;
  otpProof: string;
  otpProofExpiresAt: string;
}

type VerifyFailureCode =
  'OTP_INVALID_OR_EXPIRED' | 'OTP_ATTEMPTS_EXCEEDED' | 'OTP_CODE_MISMATCH';

type VerifyOutcome =
  | { ok: true; result: VerifyGuestOtpResult }
  | { ok: false; code: VerifyFailureCode; message: string };

/**
 * Bước 2 — xác thực OTP và phát proof một lần.
 * - Attempt counter tăng nguyên tử dưới row lock.
 * - Sai quá 5 lần hoặc hết hạn → challenge bị khóa, không thể dùng.
 * - Proof chỉ trả raw một lần; DB giữ SHA-256.
 * - Lỗi xác thực được trả SAU khi transaction commit để bộ đếm attempts/lần
 *   khóa challenge không bị rollback (nếu throw trong transaction, mọi lần
 *   nhập sai sẽ không được ghi nhận).
 */
@Injectable()
export class VerifyGuestOtpUseCase {
  constructor(private readonly store: GuestCheckoutStore) {}

  async execute(input: VerifyGuestOtpInput): Promise<VerifyGuestOtpResult> {
    let email: string;
    try {
      email = normalizeGuestEmail(input.email);
    } catch (error: unknown) {
      if (error instanceof GuestCheckoutPayloadError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }

    const codeHash = hashGuestOtpCode(email, GUEST_OTP_PURPOSE, input.code);

    const outcome = await this.store.withTransaction<VerifyOutcome>(
      async (transaction, store) => {
        const challenge = await store.lockLatestActiveChallengeIn(
          transaction,
          email,
        );
        if (!challenge) {
          return {
            ok: false,
            code: 'OTP_INVALID_OR_EXPIRED',
            message: 'Mã OTP không hợp lệ hoặc đã hết hạn.',
          };
        }
        const now = await store.databaseNowIn(transaction);
        const usability = inspectGuestOtpChallenge(challenge, now);
        if (!usability.usable) {
          await store.invalidateChallengeIn(transaction, challenge.id, now);
          return {
            ok: false,
            code: usability.exhausted
              ? 'OTP_ATTEMPTS_EXCEEDED'
              : 'OTP_INVALID_OR_EXPIRED',
            message: usability.exhausted
              ? 'Nhập sai quá số lần cho phép. Vui lòng gửi lại mã.'
              : 'Mã OTP không hợp lệ hoặc đã hết hạn.',
          };
        }

        if (!safeEqualHex(challenge.codeHash, codeHash)) {
          const attempts = await store.incrementChallengeAttemptsIn(
            transaction,
            challenge.id,
          );
          if (attempts >= GUEST_OTP_MAX_ATTEMPTS) {
            await store.invalidateChallengeIn(transaction, challenge.id, now);
          }
          return {
            ok: false,
            code:
              attempts >= GUEST_OTP_MAX_ATTEMPTS
                ? 'OTP_ATTEMPTS_EXCEEDED'
                : 'OTP_CODE_MISMATCH',
            message:
              attempts >= GUEST_OTP_MAX_ATTEMPTS
                ? 'Nhập sai quá số lần cho phép. Vui lòng gửi lại mã.'
                : 'Mã OTP không chính xác. Vui lòng thử lại.',
          };
        }

        const consumed = await store.consumeChallengeIn(
          transaction,
          challenge.id,
          now,
        );
        if (!consumed) {
          return {
            ok: false,
            code: 'OTP_INVALID_OR_EXPIRED',
            message: 'Mã OTP không hợp lệ hoặc đã hết hạn.',
          };
        }

        const rawProof = generateGuestOtpProof();
        const proof = await store.insertProofIn(transaction, {
          email,
          purpose: GUEST_OTP_PURPOSE,
          tokenHash: hashGuestProofToken(rawProof),
          expiresAt: new Date(now.getTime() + GUEST_OTP_PROOF_TTL_MS),
        });

        return {
          ok: true,
          result: {
            verified: true as const,
            otpProof: rawProof,
            otpProofExpiresAt: proof.expiresAt.toISOString(),
          },
        };
      },
    );

    if (!outcome.ok) {
      throw new BadRequestException({
        code: outcome.code,
        message: outcome.message,
      });
    }
    return outcome.result;
  }
}
