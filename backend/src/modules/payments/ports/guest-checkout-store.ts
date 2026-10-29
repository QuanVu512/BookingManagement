import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';

/**
 * Bước 2 — persistence port cho guest checkout (OTP challenge, proof, intent).
 * Mọi mutation fencing chạy trong transaction do caller sở hữu để booking,
 * proof và intent commit nguyên tử. Adapter Prisma là nơi duy nhất biết SQL.
 */
export interface StoredGuestOtpChallenge {
  id: string;
  email: string;
  purpose: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
}

export type StoredGuestOtpProofStatus = 'ACTIVE' | 'CONSUMED' | 'EXPIRED';

export interface StoredGuestOtpProof {
  id: string;
  email: string;
  purpose: string;
  tokenHash: string;
  status: StoredGuestOtpProofStatus;
  fencingGeneration: bigint;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}

export type StoredGuestIntentStatus = 'COMMITTED' | 'EXPIRED';

export interface StoredGuestCheckoutIntent {
  checkoutIntentId: string;
  bookingId: string;
  otpProofId: string;
  recoverySecretHash: string;
  payloadFingerprint: string;
  fingerprintVersion: string;
  fencingGeneration: bigint;
  status: StoredGuestIntentStatus;
  createdAt: Date;
  expiresAt: Date;
}

export interface InsertGuestCheckoutIntentInput {
  checkoutIntentId: string;
  bookingId: string;
  otpProofId: string;
  recoverySecretHash: string;
  payloadFingerprint: string;
  fingerprintVersion: string;
  fencingGeneration: bigint;
  expiresAt: Date;
}

export interface InsertGuestOtpChallengeInput {
  email: string;
  purpose: string;
  codeHash: string;
  expiresAt: Date;
}

export interface InsertGuestOtpProofInput {
  email: string;
  purpose: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface GuestCheckoutReconcileReport {
  expiredProofs: number;
  expiredIntents: number;
  consumedProofsWithoutIntent: string[];
  intentsWithoutConsumedProof: string[];
  intentsWithoutBooking: string[];
}

export abstract class GuestCheckoutStore {
  abstract withTransaction<Result>(
    work: (
      transaction: TransactionContext,
      store: GuestCheckoutStore,
    ) => Promise<Result>,
  ): Promise<Result>;

  abstract databaseNow(): Promise<Date>;
  abstract databaseNowIn(transaction: TransactionContext): Promise<Date>;

  /** Advisory lock theo checkoutIntentId — serialize create/replay cùng intent. */
  abstract lockIntent(
    transaction: TransactionContext,
    checkoutIntentId: string,
  ): Promise<void>;

  /** Advisory lock theo email — serialize resend cooldown/invalidate. */
  abstract lockOtpRecipient(
    transaction: TransactionContext,
    email: string,
  ): Promise<void>;

  abstract findIntentById(
    checkoutIntentId: string,
  ): Promise<StoredGuestCheckoutIntent | null>;
  abstract findIntentByIdIn(
    transaction: TransactionContext,
    checkoutIntentId: string,
  ): Promise<StoredGuestCheckoutIntent | null>;
  abstract findIntentByBookingIdIn(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<StoredGuestCheckoutIntent | null>;
  abstract insertIntent(
    transaction: TransactionContext,
    input: InsertGuestCheckoutIntentInput,
  ): Promise<void>;

  abstract findProofByTokenHash(
    tokenHash: string,
  ): Promise<StoredGuestOtpProof | null>;
  abstract findProofByIdIn(
    transaction: TransactionContext,
    proofId: string,
  ): Promise<StoredGuestOtpProof | null>;

  /**
   * UPDATE nguyên tử: chỉ ACTIVE, còn hạn tại clock_timestamp, đúng email +
   * purpose. Trả generation mới hoặc null khi thua race/hết hạn.
   */
  abstract consumeProof(
    transaction: TransactionContext,
    input: { proofId: string; email: string; purpose: string },
  ): Promise<{ fencingGeneration: bigint } | null>;

  abstract insertProofIn(
    transaction: TransactionContext,
    input: InsertGuestOtpProofInput,
  ): Promise<StoredGuestOtpProof>;

  abstract findLatestChallengeCreatedAtIn(
    transaction: TransactionContext,
    email: string,
  ): Promise<Date | null>;
  abstract lockLatestActiveChallengeIn(
    transaction: TransactionContext,
    email: string,
  ): Promise<StoredGuestOtpChallenge | null>;
  abstract invalidateActiveChallengesIn(
    transaction: TransactionContext,
    email: string,
    now: Date,
  ): Promise<number>;
  abstract invalidateChallengeIn(
    transaction: TransactionContext,
    challengeId: string,
    now: Date,
  ): Promise<void>;
  /**
   * Xóa hẳn challenge vừa tạo khi gửi email thất bại: challenge chưa từng tới
   * tay khách nên không được tính vào cooldown resend.
   */
  abstract deleteChallengeIn(
    transaction: TransactionContext,
    challengeId: string,
  ): Promise<void>;
  abstract incrementChallengeAttemptsIn(
    transaction: TransactionContext,
    challengeId: string,
  ): Promise<number>;
  abstract consumeChallengeIn(
    transaction: TransactionContext,
    challengeId: string,
    now: Date,
  ): Promise<boolean>;
  abstract insertChallengeIn(
    transaction: TransactionContext,
    input: InsertGuestOtpChallengeInput,
  ): Promise<StoredGuestOtpChallenge>;

  /** Reconcile: chỉ housekeeping trạng thái, không sửa dữ liệu tài chính. */
  abstract expireOverdueProofs(limit: number): Promise<number>;
  abstract expireOverdueIntents(limit: number): Promise<number>;
  abstract findConsumedProofsWithoutIntent(limit: number): Promise<string[]>;
  abstract findIntentsWithoutConsumedProof(limit: number): Promise<string[]>;
  abstract findIntentsWithoutBooking(limit: number): Promise<string[]>;
}
