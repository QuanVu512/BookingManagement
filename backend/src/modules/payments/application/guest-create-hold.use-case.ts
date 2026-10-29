import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CourtScheduleReader } from '../../courts/application/court-schedule-reader.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';
import {
  BOOKING_POLICY_VERSION,
  HOLD_DURATION_MS,
} from '../../bookings/booking.constants.js';
import { isExclusionConflictError } from '../../bookings/domain/booking-errors.js';
import { PAYMENT_TRANSACTION_OPTIONS } from '../payment.constants.js';
import { prepaymentAmountFor } from '../domain/money.js';
import {
  GuestCheckoutPayloadError,
  createGuestHoldFingerprint,
  normalizeGuestCourtId,
  normalizeGuestEmail,
  normalizeGuestInstant,
  normalizeGuestName,
  normalizeGuestPhone,
  normalizeGuestTermsVersion,
  type GuestHoldFingerprintResult,
} from '../domain/guest-checkout-fingerprint.js';
import { CHECKOUT_RECOVERY_TOKEN_TTL_MS } from '../domain/guest-checkout-token-policy.js';
import {
  GUEST_OTP_PURPOSE,
  hashGuestProofToken,
  hashGuestRecoverySecret,
  safeEqualHex,
} from '../domain/guest-otp-policy.js';
import { GuestCheckoutStore } from '../ports/guest-checkout-store.js';
import type { StoredGuestCheckoutIntent } from '../ports/guest-checkout-store.js';
import { GuestTokenService } from '../infrastructure/guest-token.service.js';
import { RedisService } from '../../../infrastructure/redis/redis.service.js';
import { invalidateCourtDayCache } from '../../bookings/application/get-court-day-occupancies.use-case.js';

export interface GuestCreateHoldInput {
  courtId: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  prepaymentPercent?: number;
  idempotencyKey: string;
  otpProof: string;
  checkoutIntentId: string;
  recoverySecret: string;
  termsVersion?: string;
}

export interface GuestHoldResult {
  bookingId: string;
  bookingCode: string;
  holdExpiresAt: string;
  totalAmount: number;
  prepaymentAmount: number;
  accessToken: string;
  accessTokenExpiresAt: string;
  checkoutToken: string;
  checkoutTokenExpiresAt: string;
  checkoutIntentId: string;
  serverNow: string;
}

interface NormalizedGuestHoldInput {
  courtId: string;
  startsAt: string;
  endsAt: string;
  email: string;
  name: string;
  phone: string;
  termsVersion: string;
}

interface BookingSnapshot {
  id: string;
  bookingCode: string;
  createdAt: Date;
  holdExpiresAt: Date;
  totalAmount: { toString(): string } | number;
  requiredPrepaymentAmount?: { toString(): string } | number;
}

const GUEST_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * E3 — Guest hold 30% deposit + token MANAGE_BOOKING + CheckoutRecoveryToken.
 * Bước 2: mọi hold mới bắt buộc OTP proof còn hạn đúng email + checkoutIntentId
 * + recoverySecret. PostgreSQL là authority; replay đọc intent trước và không
 * phụ thuộc proof còn hạn (Contract F1).
 */
@Injectable()
export class GuestCreateHoldUseCase {
  private readonly logger = new Logger(GuestCreateHoldUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedule: CourtScheduleReader,
    private readonly config: ConfigService,
    private readonly guestStore: GuestCheckoutStore,
    private readonly tokens: GuestTokenService,
    @Optional() private readonly redis?: RedisService,
  ) {}

  private tokenTtlDays(): number {
    const raw = Number(
      this.config.get<string>('GUEST_MANAGE_TOKEN_TTL_DAYS') ?? '30',
    );
    return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 90) : 30;
  }

  async execute(input: GuestCreateHoldInput): Promise<GuestHoldResult> {
    const percent = input.prepaymentPercent ?? 30;
    if (percent !== 30) {
      throw new BadRequestException({
        code: 'GUEST_PREPAYMENT_30_ONLY',
        message: 'Khách vãng lai bắt buộc thanh toán đặt cọc 30%.',
      });
    }

    const normalized = this.normalizeInput(input);
    this.assertIdentityInput(input);
    const fingerprint = this.fingerprintOf(normalized);
    const secretHash = hashGuestRecoverySecret(input.recoverySecret);

    // Contract F1 bước 1: replay priority — intent đã commit thắng mọi kiểm
    // tra proof còn hạn. Chỉ cần đúng recoverySecret + cùng payload.
    const existingIntent = await this.guestStore.findIntentById(
      input.checkoutIntentId,
    );
    if (existingIntent) {
      return this.replayIntent(
        existingIntent,
        fingerprint,
        secretHash,
        await this.guestStore.databaseNow(),
      );
    }

    const proof = await this.guestStore.findProofByTokenHash(
      hashGuestProofToken(input.otpProof),
    );
    if (!proof) {
      throw new ForbiddenException({
        code: 'OTP_PROOF_INVALID',
        message: 'Mã xác thực email không hợp lệ.',
      });
    }
    if (
      proof.purpose !== GUEST_OTP_PURPOSE ||
      proof.email !== normalized.email
    ) {
      // AC-02: proof của email khác bị từ chối trước khi mở transaction.
      throw new ForbiddenException({
        code: 'OTP_PROOF_EMAIL_MISMATCH',
        message: 'Mã xác thực email không khớp với email đặt sân.',
      });
    }
    const fastNow = await this.guestStore.databaseNow();
    if (proof.status === 'CONSUMED') {
      // Request song song có thể vừa commit intent sau lần đọc đầu; trả replay
      // của winner thay vì báo proof đã dùng (idempotent theo checkoutIntentId).
      const winner = await this.guestStore.findIntentById(
        input.checkoutIntentId,
      );
      if (winner) {
        return this.replayIntent(
          winner,
          fingerprint,
          secretHash,
          await this.guestStore.databaseNow(),
        );
      }
      throw new ConflictException({
        code: 'OTP_PROOF_ALREADY_CONSUMED',
        message: 'Mã xác thực email đã được sử dụng. Vui lòng xác thực lại.',
      });
    }
    if (proof.status === 'EXPIRED' || proof.expiresAt <= fastNow) {
      throw new GoneException({
        code: 'PROOF_EXPIRED',
        message: 'Mã xác thực email đã hết hạn. Vui lòng xác thực lại.',
      });
    }

    try {
      const created = await this.prisma.$transaction(
        (transaction) =>
          this.createInTransaction(
            transaction,
            input,
            normalized,
            fingerprint,
            secretHash,
            proof.id,
          ),
        PAYMENT_TRANSACTION_OPTIONS,
      );
      // Day-grid invalidation after commit (fail-open, same contract as the
      // member hold path). Replay paths return before any mutation.
      await invalidateCourtDayCache(this.redis, normalized.courtId);
      return created;
    } catch (error: unknown) {
      // Request song song có thể vừa commit cùng checkoutIntentId. Sau rollback
      // đọc lại intent và trả replay nếu secret/fingerprint khớp.
      if (isReplayCandidate(error)) {
        const winner = await this.guestStore.findIntentById(
          input.checkoutIntentId,
        );
        if (winner) {
          return this.replayIntent(
            winner,
            fingerprint,
            secretHash,
            await this.guestStore.databaseNow(),
          );
        }
      }
      if (isExclusionConflictError(error)) {
        throw new ConflictException(
          'Khung giờ vừa được giữ. Hãy chọn giờ khác.',
        );
      }
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof GoneException ||
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.error('Guest hold transaction unavailable.');
      throw new ServiceUnavailableException(
        'Chưa tạo được giữ chỗ. Hãy thử lại cùng khóa idempotency.',
      );
    }
  }

  /** checkoutIntentId là PK uuid trong DB; chặn sớm để không lộ lỗi Prisma. */
  private assertIdentityInput(input: GuestCreateHoldInput): void {
    if (!GUEST_UUID_PATTERN.test(input.checkoutIntentId)) {
      throw new BadRequestException({
        code: 'INVALID_CHECKOUT_INTENT_ID',
        message: 'checkoutIntentId phải là UUID.',
      });
    }
    if (
      typeof input.recoverySecret !== 'string' ||
      input.recoverySecret.length < 32
    ) {
      throw new BadRequestException({
        code: 'INVALID_RECOVERY_SECRET',
        message: 'recoverySecret phải dài tối thiểu 32 ký tự.',
      });
    }
  }

  private normalizeInput(
    input: GuestCreateHoldInput,
  ): NormalizedGuestHoldInput {
    try {
      return {
        courtId: normalizeGuestCourtId(input.courtId),
        startsAt: normalizeGuestInstant(input.startsAt),
        endsAt: normalizeGuestInstant(input.endsAt),
        email: normalizeGuestEmail(input.customerEmail),
        name: normalizeGuestName(input.customerName),
        phone: normalizeGuestPhone(input.customerPhone),
        termsVersion: normalizeGuestTermsVersion(input.termsVersion ?? 'v1'),
      };
    } catch (error: unknown) {
      if (error instanceof GuestCheckoutPayloadError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  }

  private fingerprintOf(
    normalized: NormalizedGuestHoldInput,
  ): GuestHoldFingerprintResult {
    return createGuestHoldFingerprint({
      courtId: normalized.courtId,
      startsAt: normalized.startsAt,
      endsAt: normalized.endsAt,
      email: normalized.email,
      name: normalized.name,
      phone: normalized.phone,
      termsVersion: normalized.termsVersion,
    });
  }

  private async createInTransaction(
    transaction: TransactionContext,
    input: GuestCreateHoldInput,
    normalized: NormalizedGuestHoldInput,
    fingerprint: GuestHoldFingerprintResult,
    secretHash: string,
    proofId: string,
  ): Promise<GuestHoldResult> {
    await this.guestStore.lockIntent(transaction, input.checkoutIntentId);
    const now = await this.guestStore.databaseNowIn(transaction);

    const existingIntent = await this.guestStore.findIntentByIdIn(
      transaction,
      input.checkoutIntentId,
    );
    if (existingIntent) {
      return this.replayIntent(
        existingIntent,
        fingerprint,
        secretHash,
        now,
        transaction,
      );
    }

    // Legacy guard: idempotency key đã thuộc booking khác/không có intent thì
    // không thể chứng minh quyền sở hữu bằng recoverySecret.
    const idempotentBooking = await transaction.booking.findFirst({
      where: { userId: null, idempotencyKey: input.idempotencyKey },
      select: { id: true },
    });
    if (idempotentBooking) {
      throw new ConflictException({
        code: 'PAYMENT_IDEMPOTENCY_CONFLICT',
        message:
          'Khóa idempotency đã thuộc một đơn cũ không có intent khôi phục. Vui lòng liên hệ hỗ trợ.',
      });
    }

    // Contract F1 bước 4: consume proof bằng UPDATE nguyên tử, kiểm hạn và
    // binding tại thời điểm ghi sau khi đã giữ advisory lock.
    const consumed = await this.guestStore.consumeProof(transaction, {
      proofId,
      email: normalized.email,
      purpose: GUEST_OTP_PURPOSE,
    });
    if (!consumed) {
      const winner = await this.guestStore.findIntentByIdIn(
        transaction,
        input.checkoutIntentId,
      );
      if (winner) {
        return this.replayIntent(
          winner,
          fingerprint,
          secretHash,
          now,
          transaction,
        );
      }
      const current = await this.guestStore.findProofByIdIn(
        transaction,
        proofId,
      );
      if (current?.status === 'CONSUMED') {
        throw new ConflictException({
          code: 'OTP_PROOF_ALREADY_CONSUMED',
          message: 'Mã xác thực email đã được sử dụng cho đơn khác.',
        });
      }
      if (current && current.expiresAt <= now) {
        throw new GoneException({
          code: 'PROOF_EXPIRED',
          message: 'Mã xác thực email đã hết hạn. Vui lòng xác thực lại.',
        });
      }
      throw new ForbiddenException({
        code: 'OTP_PROOF_INVALID',
        message: 'Mã xác thực email không hợp lệ.',
      });
    }

    const startsAt = new Date(normalized.startsAt);
    const endsAt = new Date(normalized.endsAt);
    if (startsAt.getTime() < now.getTime() + HOLD_DURATION_MS) {
      throw new BadRequestException({
        code: 'STARTS_AT_TOO_SOON',
        message: 'Giờ bắt đầu phải cách hiện tại ít nhất 5 phút.',
      });
    }
    const court = await this.schedule.getActiveSchedule(
      normalized.courtId,
      transaction,
    );
    const quote = this.schedule.quote(court, startsAt, endsAt);
    const total = quote.totalAmount;
    const required = prepaymentAmountFor(total, 30);
    const bookingCode = `BK-${randomUUID().replaceAll('-', '').slice(0, 24)}`;
    const holdExpiresAt = new Date(now.getTime() + HOLD_DURATION_MS);

    const booking = await transaction.booking.create({
      data: {
        bookingCode,
        userId: null,
        courtId: court.id,
        branchId: court.branchId,
        source: 'CUSTOMER_WEB',
        customerName: normalized.name,
        customerEmail: normalized.email,
        customerPhone: normalized.phone,
        startsAt,
        endsAt,
        cleanupMinutes: court.cleanupMinutes,
        totalAmount: total,
        prepaymentPercent: 30,
        requiredPrepaymentAmount: required,
        status: 'HOLDING',
        holdExpiresAt,
        cancellationRule: 'BEFORE_START',
        cancellationDeadlineAt: startsAt,
        policyVersion: BOOKING_POLICY_VERSION,
        policyAcceptedAt: now,
        idempotencyKey: input.idempotencyKey,
      },
    });
    if (quote.items.length) {
      await transaction.bookingPriceItem.createMany({
        data: quote.items.map((item) => ({ ...item, bookingId: booking.id })),
      });
    }
    await transaction.bookingStatusHistory.create({
      data: {
        bookingId: booking.id,
        toStatus: 'HOLDING',
        actorType: 'GUEST',
      },
    });
    await transaction.courtOccupancy.create({
      data: {
        bookingId: booking.id,
        courtId: booking.courtId,
        kind: 'BOOKING',
        occupiedFrom: booking.startsAt,
        occupiedUntil: new Date(
          booking.endsAt.getTime() + booking.cleanupMinutes * 60_000,
        ),
      },
    });

    await this.guestStore.insertIntent(transaction, {
      checkoutIntentId: input.checkoutIntentId,
      bookingId: booking.id,
      otpProofId: proofId,
      recoverySecretHash: secretHash,
      payloadFingerprint: fingerprint.digest,
      fingerprintVersion: fingerprint.version,
      fencingGeneration: consumed.fencingGeneration,
      expiresAt: new Date(now.getTime() + CHECKOUT_RECOVERY_TOKEN_TTL_MS),
    });

    // Token MANAGE phát hành cùng tx; raw trả một lần duy nhất ở lần tạo đầu.
    const rawToken = randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(
      Math.max(startsAt.getTime(), now.getTime()) +
        this.tokenTtlDays() * 86_400_000,
    );
    await transaction.bookingAccessToken.create({
      data: {
        bookingId: booking.id,
        purpose: 'MANAGE_BOOKING',
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: tokenExpiresAt,
      },
    });

    const checkout = await this.tokens.issueCheckoutToken({
      bookingId: booking.id,
      holdIssuedAt: now,
      transaction,
    });

    return this.present(
      booking,
      rawToken,
      tokenExpiresAt,
      checkout,
      now,
      input.checkoutIntentId,
    );
  }

  private async replayIntent(
    intent: StoredGuestCheckoutIntent,
    fingerprint: GuestHoldFingerprintResult,
    secretHash: string,
    now: Date,
    transaction?: TransactionContext,
  ): Promise<GuestHoldResult> {
    if (!safeEqualHex(intent.recoverySecretHash, secretHash)) {
      // AC-07: không tiết lộ booking/ký tự nào khi secret sai.
      throw new ForbiddenException({
        code: 'RECOVERY_SECRET_INVALID',
        message: 'Khóa khôi phục không hợp lệ.',
      });
    }
    if (intent.payloadFingerprint !== fingerprint.digest) {
      throw new ConflictException({
        code: 'CHECKOUT_INTENT_PAYLOAD_MISMATCH',
        message:
          'Mã ý định đã gắn với thông tin đặt sân khác. Vui lòng tạo đơn mới.',
      });
    }
    const booking = transaction
      ? await transaction.booking.findUnique({
          where: { id: intent.bookingId },
        })
      : await this.prisma.booking.findUnique({
          where: { id: intent.bookingId },
        });
    if (!booking || booking.userId !== null) {
      throw new ConflictException({
        code: 'CHECKOUT_INTENT_BOOKING_MISSING',
        message: 'Không khôi phục được đơn giữ chỗ. Vui lòng liên hệ hỗ trợ.',
      });
    }
    const checkout = await this.tokens.issueCheckoutToken({
      bookingId: booking.id,
      holdIssuedAt: booking.createdAt,
      transaction,
    });
    return this.present(
      booking,
      null,
      null,
      checkout,
      now,
      intent.checkoutIntentId,
    );
  }

  private present(
    booking: BookingSnapshot,
    rawManageToken: string | null,
    manageExpiresAt: Date | null,
    checkout: { rawToken: string; expiresAt: Date },
    now: Date,
    checkoutIntentId: string,
  ): GuestHoldResult {
    const totalAmount = Number(booking.totalAmount.toString());
    const prepaymentAmount =
      booking.requiredPrepaymentAmount != null
        ? Number(booking.requiredPrepaymentAmount.toString())
        : Math.floor((totalAmount * 30 + 50) / 100);
    return {
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      holdExpiresAt: booking.holdExpiresAt.toISOString(),
      totalAmount,
      prepaymentAmount,
      accessToken: rawManageToken ?? '',
      accessTokenExpiresAt: manageExpiresAt
        ? manageExpiresAt.toISOString()
        : '',
      checkoutToken: checkout.rawToken,
      checkoutTokenExpiresAt: checkout.expiresAt.toISOString(),
      checkoutIntentId,
      serverNow: now.toISOString(),
    };
  }
}

function isReplayCandidate(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: unknown }).code
      : undefined;
  return code === 'P2002';
}
