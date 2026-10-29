import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import {
  GuestCheckoutStore,
  type InsertGuestCheckoutIntentInput,
  type InsertGuestOtpChallengeInput,
  type InsertGuestOtpProofInput,
  type StoredGuestCheckoutIntent,
  type StoredGuestIntentStatus,
  type StoredGuestOtpChallenge,
  type StoredGuestOtpProof,
  type StoredGuestOtpProofStatus,
} from '../ports/guest-checkout-store.js';

@Injectable()
export class PrismaGuestCheckoutStore extends GuestCheckoutStore {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  withTransaction<Result>(
    work: (
      transaction: TransactionContext,
      store: GuestCheckoutStore,
    ) => Promise<Result>,
  ): Promise<Result> {
    return this.prisma.$transaction(
      (transaction) => work(transaction, this),
      PAYMENT_TRANSACTION_OPTIONS,
    );
  }

  async databaseNow(): Promise<Date> {
    const [clock] = await this.prisma.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    return clock.now;
  }

  async databaseNowIn(transaction: TransactionContext): Promise<Date> {
    const [clock] = await transaction.$queryRaw<{ now: Date }[]>`
      SELECT clock_timestamp() AS now`;
    return clock.now;
  }

  async lockIntent(
    transaction: TransactionContext,
    checkoutIntentId: string,
  ): Promise<void> {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('guest-checkout-intent'),
        hashtext(${checkoutIntentId})
      )`;
  }

  async lockOtpRecipient(
    transaction: TransactionContext,
    email: string,
  ): Promise<void> {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext('guest-otp-challenge'),
        hashtext(${email})
      )`;
  }

  async findIntentById(
    checkoutIntentId: string,
  ): Promise<StoredGuestCheckoutIntent | null> {
    const row = await this.prisma.guestCheckoutIntent.findUnique({
      where: { checkoutIntentId },
    });
    return row ? toStoredIntent(row) : null;
  }

  async findIntentByIdIn(
    transaction: TransactionContext,
    checkoutIntentId: string,
  ): Promise<StoredGuestCheckoutIntent | null> {
    const row = await transaction.guestCheckoutIntent.findUnique({
      where: { checkoutIntentId },
    });
    return row ? toStoredIntent(row) : null;
  }

  async findIntentByBookingIdIn(
    transaction: TransactionContext,
    bookingId: string,
  ): Promise<StoredGuestCheckoutIntent | null> {
    const row = await transaction.guestCheckoutIntent.findUnique({
      where: { bookingId },
    });
    return row ? toStoredIntent(row) : null;
  }

  async insertIntent(
    transaction: TransactionContext,
    input: InsertGuestCheckoutIntentInput,
  ): Promise<void> {
    await transaction.guestCheckoutIntent.create({
      data: {
        checkoutIntentId: input.checkoutIntentId,
        bookingId: input.bookingId,
        otpProofId: input.otpProofId,
        recoverySecretHash: input.recoverySecretHash,
        payloadFingerprint: input.payloadFingerprint,
        fingerprintVersion: input.fingerprintVersion,
        fencingGeneration: input.fencingGeneration,
        status: 'COMMITTED',
        expiresAt: input.expiresAt,
      },
    });
  }

  async findProofByTokenHash(
    tokenHash: string,
  ): Promise<StoredGuestOtpProof | null> {
    const row = await this.prisma.guestOtpProof.findUnique({
      where: { tokenHash },
    });
    return row ? toStoredProof(row) : null;
  }

  async findProofByIdIn(
    transaction: TransactionContext,
    proofId: string,
  ): Promise<StoredGuestOtpProof | null> {
    const row = await transaction.guestOtpProof.findUnique({
      where: { id: proofId },
    });
    return row ? toStoredProof(row) : null;
  }

  /**
   * Contract F1 bước 4: điều kiện hạn/binding nằm trong chính UPDATE, dùng
   * clock_timestamp() để request chờ advisory lock qua mốc hết hạn trả 0 row.
   */
  async consumeProof(
    transaction: TransactionContext,
    input: { proofId: string; email: string; purpose: string },
  ): Promise<{ fencingGeneration: bigint } | null> {
    const rows = await transaction.$queryRaw<{ fencing_generation: bigint }[]>`
      UPDATE guest_otp_proofs
      SET status = 'CONSUMED',
          consumed_at = clock_timestamp(),
          fencing_generation = fencing_generation + 1
      WHERE id = ${input.proofId}::uuid
        AND status = 'ACTIVE'
        AND expires_at > clock_timestamp()
        AND email = ${input.email}
        AND purpose = ${input.purpose}
      RETURNING fencing_generation`;
    const row = rows[0];
    return row ? { fencingGeneration: row.fencing_generation } : null;
  }

  async insertProofIn(
    transaction: TransactionContext,
    input: InsertGuestOtpProofInput,
  ): Promise<StoredGuestOtpProof> {
    const row = await transaction.guestOtpProof.create({
      data: {
        email: input.email,
        purpose: input.purpose,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
    return toStoredProof(row);
  }

  async findLatestChallengeCreatedAtIn(
    transaction: TransactionContext,
    email: string,
  ): Promise<Date | null> {
    const row = await transaction.guestOtpChallenge.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  async lockLatestActiveChallengeIn(
    transaction: TransactionContext,
    email: string,
  ): Promise<StoredGuestOtpChallenge | null> {
    const rows = await transaction.$queryRaw<
      {
        id: string;
        email: string;
        purpose: string;
        code_hash: string;
        attempts: number;
        expires_at: Date;
        consumed_at: Date | null;
        invalidated_at: Date | null;
        created_at: Date;
      }[]
    >`
      SELECT id, email, purpose, code_hash, attempts, expires_at,
             consumed_at, invalidated_at, created_at
      FROM guest_otp_challenges
      WHERE email = ${email}
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      purpose: row.purpose,
      codeHash: row.code_hash,
      attempts: row.attempts,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at,
      invalidatedAt: row.invalidated_at,
      createdAt: row.created_at,
    };
  }

  async invalidateActiveChallengesIn(
    transaction: TransactionContext,
    email: string,
    now: Date,
  ): Promise<number> {
    const changed = await transaction.guestOtpChallenge.updateMany({
      where: { email, consumedAt: null, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
    return changed.count;
  }

  async invalidateChallengeIn(
    transaction: TransactionContext,
    challengeId: string,
    now: Date,
  ): Promise<void> {
    await transaction.guestOtpChallenge.updateMany({
      where: { id: challengeId, invalidatedAt: null },
      data: { invalidatedAt: now },
    });
  }

  async deleteChallengeIn(
    transaction: TransactionContext,
    challengeId: string,
  ): Promise<void> {
    await transaction.guestOtpChallenge.deleteMany({
      where: { id: challengeId },
    });
  }

  async incrementChallengeAttemptsIn(
    transaction: TransactionContext,
    challengeId: string,
  ): Promise<number> {
    const rows = await transaction.$queryRaw<{ attempts: number }[]>`
      UPDATE guest_otp_challenges
      SET attempts = attempts + 1
      WHERE id = ${challengeId}::uuid
      RETURNING attempts`;
    return rows[0]?.attempts ?? 0;
  }

  async consumeChallengeIn(
    transaction: TransactionContext,
    challengeId: string,
    now: Date,
  ): Promise<boolean> {
    const rows = await transaction.$queryRaw<{ id: string }[]>`
      UPDATE guest_otp_challenges
      SET consumed_at = ${now}
      WHERE id = ${challengeId}::uuid
        AND consumed_at IS NULL
        AND invalidated_at IS NULL
        AND expires_at > ${now}
      RETURNING id`;
    return rows.length > 0;
  }

  async insertChallengeIn(
    transaction: TransactionContext,
    input: InsertGuestOtpChallengeInput,
  ): Promise<StoredGuestOtpChallenge> {
    const row = await transaction.guestOtpChallenge.create({
      data: {
        email: input.email,
        purpose: input.purpose,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
      },
    });
    return toStoredChallenge(row);
  }

  async expireOverdueProofs(limit: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE guest_otp_proofs
      SET status = 'EXPIRED'
      WHERE id IN (
        SELECT id FROM guest_otp_proofs
        WHERE status = 'ACTIVE' AND expires_at <= clock_timestamp()
        ORDER BY expires_at
        LIMIT ${limit}
      )
      RETURNING id`;
    return rows.length;
  }

  async expireOverdueIntents(limit: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ checkout_intent_id: string }[]>`
      UPDATE guest_checkout_intents
      SET status = 'EXPIRED'
      WHERE checkout_intent_id IN (
        SELECT checkout_intent_id FROM guest_checkout_intents
        WHERE status = 'COMMITTED' AND expires_at <= clock_timestamp()
        ORDER BY expires_at
        LIMIT ${limit}
      )
      RETURNING checkout_intent_id`;
    return rows.length;
  }

  async findConsumedProofsWithoutIntent(limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p.id::text AS id
      FROM guest_otp_proofs p
      LEFT JOIN guest_checkout_intents i ON i.otp_proof_id = p.id
      WHERE p.status = 'CONSUMED' AND i.checkout_intent_id IS NULL
      ORDER BY p.consumed_at
      LIMIT ${limit}`;
    return rows.map((row) => row.id);
  }

  async findIntentsWithoutConsumedProof(limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ checkout_intent_id: string }[]>`
      SELECT i.checkout_intent_id::text AS checkout_intent_id
      FROM guest_checkout_intents i
      JOIN guest_otp_proofs p ON p.id = i.otp_proof_id
      WHERE p.status <> 'CONSUMED'
      ORDER BY i.created_at
      LIMIT ${limit}`;
    return rows.map((row) => row.checkout_intent_id);
  }

  async findIntentsWithoutBooking(limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ checkout_intent_id: string }[]>`
      SELECT i.checkout_intent_id::text AS checkout_intent_id
      FROM guest_checkout_intents i
      LEFT JOIN bookings b ON b.id = i.booking_id
      WHERE b.id IS NULL
      ORDER BY i.created_at
      LIMIT ${limit}`;
    return rows.map((row) => row.checkout_intent_id);
  }
}

function toStoredIntent(row: {
  checkoutIntentId: string;
  bookingId: string;
  otpProofId: string;
  recoverySecretHash: string;
  payloadFingerprint: string;
  fingerprintVersion: string;
  fencingGeneration: bigint;
  status: string;
  createdAt: Date;
  expiresAt: Date;
}): StoredGuestCheckoutIntent {
  return {
    checkoutIntentId: row.checkoutIntentId,
    bookingId: row.bookingId,
    otpProofId: row.otpProofId,
    recoverySecretHash: row.recoverySecretHash,
    payloadFingerprint: row.payloadFingerprint,
    fingerprintVersion: row.fingerprintVersion,
    fencingGeneration: row.fencingGeneration,
    status: row.status as StoredGuestIntentStatus,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
  };
}

function toStoredProof(row: {
  id: string;
  email: string;
  purpose: string;
  tokenHash: string;
  status: string;
  fencingGeneration: bigint;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
}): StoredGuestOtpProof {
  return {
    id: row.id,
    email: row.email,
    purpose: row.purpose,
    tokenHash: row.tokenHash,
    status: row.status as StoredGuestOtpProofStatus,
    fencingGeneration: row.fencingGeneration,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  };
}

function toStoredChallenge(row: {
  id: string;
  email: string;
  purpose: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
  createdAt: Date;
}): StoredGuestOtpChallenge {
  return {
    id: row.id,
    email: row.email,
    purpose: row.purpose,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    invalidatedAt: row.invalidatedAt,
    createdAt: row.createdAt,
  };
}
