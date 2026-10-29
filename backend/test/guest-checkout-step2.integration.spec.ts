import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { PrismaCourtScheduleReader } from '../src/modules/courts/infrastructure/prisma-court-schedule-reader.js';
import { GuestCreateHoldUseCase } from '../src/modules/payments/application/guest-create-hold.use-case.js';
import { SendGuestOtpUseCase } from '../src/modules/payments/application/send-guest-otp.use-case.js';
import { VerifyGuestOtpUseCase } from '../src/modules/payments/application/verify-guest-otp.use-case.js';
import { ResumeGuestIntentUseCase } from '../src/modules/payments/application/resume-guest-intent.use-case.js';
import { CancelGuestHoldUseCase } from '../src/modules/payments/application/cancel-guest-hold.use-case.js';
import { GetGuestHoldRecoveryUseCase } from '../src/modules/payments/application/get-guest-hold-recovery.use-case.js';
import { GuestCheckoutReconcileService } from '../src/modules/payments/application/guest-checkout-reconcile.service.js';
import { PaymentOutcomeService } from '../src/modules/payments/application/payment-outcome.service.js';
import { PrismaGuestCheckoutStore } from '../src/modules/payments/infrastructure/prisma-guest-checkout-store.js';
import { GuestTokenService } from '../src/modules/payments/infrastructure/guest-token.service.js';
import { GuestOtpSender } from '../src/modules/payments/ports/guest-otp-sender.js';
import { depositFixtures } from './helpers/booking-deposit.fixture.js';

/**
 * Bước 2 — chứng minh trên PostgreSQL thật với HAI kết nối độc lập:
 * - Adapter fencing: consume proof conditional, rollback trả ACTIVE, expiry
 *   được kiểm bằng clock_timestamp trong chính UPDATE.
 * - Create concurrency: hai request cùng proof/intent chỉ tạo 1 booking.
 * - OTP challenge PostgreSQL: cooldown, attempts, proof hash.
 * - Resume, cancel-hold, recovery snapshot và reconcile orphan.
 *
 * Chỉ chạy khi GUEST_RECOVERY_DATABASE_TEST_URL trỏ DB disposable
 * `guest_recovery_test`; không fallback DB ứng dụng và không phụ thuộc Redis.
 */
const databaseUrl = process.env.GUEST_RECOVERY_DATABASE_TEST_URL;
const TARGET_DATABASE = 'guest_recovery_test';

function assertIsolatedDatabase(value: string): void {
  const target = new URL(value);
  if (!['postgresql:', 'postgres:'].includes(target.protocol)) {
    throw new Error('Chỉ chấp nhận PostgreSQL loopback cho test này.');
  }
  if (!['127.0.0.1', 'localhost'].includes(target.hostname)) {
    throw new Error('Chỉ chấp nhận host loopback cho test này.');
  }
  if (target.pathname !== `/${TARGET_DATABASE}`) {
    throw new Error(`Chỉ chấp nhận database ${TARGET_DATABASE}.`);
  }
}

class CapturingOtpSender extends GuestOtpSender {
  readonly codes = new Map<string, string>();

  async sendCode(email: string, code: string): Promise<void> {
    this.codes.set(email, code);
  }
}

class FailingOtpSender extends GuestOtpSender {
  async sendCode(): Promise<void> {
    throw new Error('smtp unavailable');
  }
}

async function expectHttpError(
  work: Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  let caught: unknown;
  try {
    await work;
  } catch (error: unknown) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(HttpException);
  const error = caught as HttpException;
  expect(error.getStatus()).toBe(status);
  expect((error.getResponse() as { code?: string }).code).toBe(code);
}

const storageDescribe = databaseUrl ? describe : describe.skip;

storageDescribe('guest checkout Bước 2 trên PostgreSQL thật', () => {
  jest.setTimeout(60_000);

  let config: ConfigService;
  let prismaA: PrismaService;
  let prismaB: PrismaService;
  let storeA: PrismaGuestCheckoutStore;
  let storeB: PrismaGuestCheckoutStore;
  let tokensA: GuestTokenService;
  let guestA: GuestCreateHoldUseCase;
  let guestB: GuestCreateHoldUseCase;
  let sender: CapturingOtpSender;
  let sendOtp: SendGuestOtpUseCase;
  let verifyOtp: VerifyGuestOtpUseCase;
  let resume: ResumeGuestIntentUseCase;
  let cancelHold: CancelGuestHoldUseCase;
  let recovery: GetGuestHoldRecoveryUseCase;
  let reconcile: GuestCheckoutReconcileService;
  let fixtures: Awaited<ReturnType<typeof depositFixtures>>;
  let slot = 0;

  function nextStart(): Date {
    // 2035-01-08..: 08:00/10:00/…/22:00 giờ HCM (UTC+7), trong giờ mở cửa.
    const index = slot++;
    const day = 8 + Math.floor(index / 8);
    const hour = 1 + (index % 8) * 2;
    return new Date(Date.UTC(2035, 0, day, hour));
  }

  function holdInput(
    identity: {
      otpProof: string;
      checkoutIntentId: string;
      recoverySecret: string;
    },
    email = 'step2-guest@example.test',
  ) {
    const startsAt = nextStart();
    return {
      courtId: fixtures.courtId,
      startsAt: startsAt.toISOString(),
      endsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(),
      customerName: 'Step 2 Guest',
      customerPhone: '+84912345678',
      customerEmail: email,
      prepaymentPercent: 30,
      idempotencyKey: randomUUID(),
      ...identity,
    };
  }

  async function createProof(email: string) {
    const raw = `gop_${randomBytes(32).toString('hex')}`;
    const created = await storeA.withTransaction((transaction, store) =>
      store.insertProofIn(transaction, {
        email,
        purpose: 'GUEST_HOLD_CREATE',
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      }),
    );
    return {
      otpProof: raw,
      checkoutIntentId: randomUUID(),
      recoverySecret: randomBytes(32).toString('hex'),
      proofId: created.id,
    };
  }

  async function newHold(email = 'step2-guest@example.test') {
    const identity = await createProof(email);
    const input = holdInput(identity, email);
    return { identity, input, result: await guestA.execute(input) };
  }

  beforeAll(async () => {
    if (!databaseUrl) return;
    assertIsolatedDatabase(databaseUrl);
    config = new ConfigService({ DATABASE_URL: databaseUrl });
    prismaA = new PrismaService(config);
    prismaB = new PrismaService(config);
    await prismaA.$connect();
    await prismaB.$connect();
    storeA = new PrismaGuestCheckoutStore(prismaA);
    storeB = new PrismaGuestCheckoutStore(prismaB);
    tokensA = new GuestTokenService(prismaA, config);
    const schedule = new PrismaCourtScheduleReader();
    guestA = new GuestCreateHoldUseCase(
      prismaA,
      schedule,
      config,
      storeA,
      tokensA,
    );
    guestB = new GuestCreateHoldUseCase(
      prismaB,
      schedule,
      config,
      storeB,
      new GuestTokenService(prismaB, config),
    );
    sender = new CapturingOtpSender();
    sendOtp = new SendGuestOtpUseCase(storeA, sender);
    verifyOtp = new VerifyGuestOtpUseCase(storeA);
    resume = new ResumeGuestIntentUseCase(prismaA, storeA, tokensA);
    cancelHold = new CancelGuestHoldUseCase(prismaA);
    recovery = new GetGuestHoldRecoveryUseCase(
      prismaA,
      new PaymentOutcomeService(prismaA),
    );
    reconcile = new GuestCheckoutReconcileService(storeA);
    fixtures = await depositFixtures(prismaA);
  });

  afterAll(async () => {
    try {
      await prismaB?.$disconnect();
    } finally {
      await prismaA?.$disconnect();
    }
  });

  it('adapter consume proof chỉ thắng một lần giữa hai kết nối', async () => {
    const proof = await createProof('fencing@example.test');
    const race = await Promise.allSettled([
      storeA.withTransaction((transaction, store) =>
        store.consumeProof(transaction, {
          proofId: proof.proofId,
          email: 'fencing@example.test',
          purpose: 'GUEST_HOLD_CREATE',
        }),
      ),
      storeB.withTransaction((transaction, store) =>
        store.consumeProof(transaction, {
          proofId: proof.proofId,
          email: 'fencing@example.test',
          purpose: 'GUEST_HOLD_CREATE',
        }),
      ),
    ]);
    const winners = race.filter(
      (item) => item.status === 'fulfilled' && item.value !== null,
    );
    expect(winners).toHaveLength(1);
    const row = await prismaA.guestOtpProof.findUniqueOrThrow({
      where: { id: proof.proofId },
    });
    expect(row.status).toBe('CONSUMED');
    expect(row.fencingGeneration).toBe(1n);
  });

  it('consume proof kiểm hạn bằng clock_timestamp sau khi chờ', async () => {
    const raw = `gop_${randomBytes(32).toString('hex')}`;
    const created = await prismaA.guestOtpProof.create({
      data: {
        email: 'late-lock@example.test',
        purpose: 'GUEST_HOLD_CREATE',
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + 300),
      },
    });
    const result = await storeA.withTransaction(async (transaction, store) => {
      await new Promise((resolve) => setTimeout(resolve, 700));
      return store.consumeProof(transaction, {
        proofId: created.id,
        email: 'late-lock@example.test',
        purpose: 'GUEST_HOLD_CREATE',
      });
    });
    expect(result).toBeNull();
    const row = await prismaA.guestOtpProof.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(row.status).toBe('ACTIVE');
  });

  it('rollback transaction trả proof về ACTIVE, không cần worker sửa', async () => {
    const proof = await createProof('rollback@example.test');
    await expect(
      storeA.withTransaction(async (transaction, store) => {
        const consumed = await store.consumeProof(transaction, {
          proofId: proof.proofId,
          email: 'rollback@example.test',
          purpose: 'GUEST_HOLD_CREATE',
        });
        expect(consumed).not.toBeNull();
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    const row = await prismaA.guestOtpProof.findUniqueOrThrow({
      where: { id: proof.proofId },
    });
    expect(row.status).toBe('ACTIVE');
    expect(row.fencingGeneration).toBe(0n);
  });

  it('OTP challenge: cooldown, đếm lần sai và phát proof hash', async () => {
    const email = `otp-${randomUUID()}@example.test`;
    const sent = await sendOtp.execute(email);
    expect(sent.resendAfterSeconds).toBe(60);
    const code = sender.codes.get(email);
    expect(code).toMatch(/^[0-9]{6}$/);

    await expectHttpError(sendOtp.execute(email), 429, 'OTP_RESEND_COOLDOWN');

    await expectHttpError(
      verifyOtp.execute({ email, code: '000000' }),
      400,
      'OTP_CODE_MISMATCH',
    );
    const verified = await verifyOtp.execute({ email, code: code as string });
    expect(verified.otpProof).toMatch(/^gop_[0-9a-f]{64}$/);
    const proofRow = await prismaA.guestOtpProof
      .findUniqueOrThrow({
        where: { tokenHash: verified.otpProof },
      })
      .catch(() => null);
    // Raw proof không nằm trong DB; tra theo hash SHA-256.
    const hash = createHash('sha256').update(verified.otpProof).digest('hex');
    const stored = await prismaA.guestOtpProof.findUniqueOrThrow({
      where: { tokenHash: hash },
    });
    expect(proofRow).toBeNull();
    expect(stored.email).toBe(email);
    expect(stored.status).toBe('ACTIVE');
  });

  it('P2-1: gửi email lỗi xóa challenge để resend ngay không bị cooldown', async () => {
    const email = `otp-fail-${randomUUID()}@example.test`;
    const failing = new SendGuestOtpUseCase(storeA, new FailingOtpSender());

    await expect(failing.execute(email)).rejects.toThrow('smtp unavailable');
    // Challenge chưa từng tới tay khách phải bị xóa hẳn, không chỉ invalidate,
    // nếu không lần gửi lại sẽ tính vào cooldown 60 giây.
    expect(
      await prismaA.guestOtpChallenge.count({ where: { email } }),
    ).toBe(0);

    const retried = await sendOtp.execute(email);
    expect(retried.resendAfterSeconds).toBe(60);
    expect(sender.codes.get(email)).toMatch(/^[0-9]{6}$/);
  });

  it('OTP challenge khóa sau 5 lần sai', async () => {
    const email = `otp-lock-${randomUUID()}@example.test`;
    await sendOtp.execute(email);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expectHttpError(
        verifyOtp.execute({ email, code: '000000' }),
        400,
        'OTP_CODE_MISMATCH',
      );
    }
    await expectHttpError(
      verifyOtp.execute({ email, code: '000000' }),
      400,
      'OTP_ATTEMPTS_EXCEEDED',
    );
    await expectHttpError(
      verifyOtp.execute({ email, code: sender.codes.get(email) as string }),
      400,
      'OTP_INVALID_OR_EXPIRED',
    );
  });

  it('AC-01/AC-04: thiếu proof bị chặn; hai request cùng proof chỉ tạo 1 booking', async () => {
    const email = `concurrent-${randomUUID()}@example.test`;
    const identity = await createProof(email);
    const input = holdInput(identity, email);

    const missingProof = { ...input, otpProof: `gop_${'0'.repeat(64)}` };
    await expectHttpError(
      guestA.execute(missingProof),
      403,
      'OTP_PROOF_INVALID',
    );
    expect(
      await prismaA.booking.count({ where: { customerEmail: email } }),
    ).toBe(0);

    const [first, second] = await Promise.all([
      guestA.execute(input),
      guestB.execute(input),
    ]);
    expect(second.bookingId).toBe(first.bookingId);
    expect(
      await prismaA.booking.count({ where: { customerEmail: email } }),
    ).toBe(1);
    expect(
      await prismaA.guestCheckoutIntent.count({
        where: { bookingId: first.bookingId },
      }),
    ).toBe(1);
    expect(
      await prismaA.guestOtpProof.findUniqueOrThrow({
        where: { id: identity.proofId },
      }),
    ).toMatchObject({ status: 'CONSUMED', fencingGeneration: 1n });
    expect(
      await prismaA.bookingAccessToken.count({
        where: { bookingId: first.bookingId, purpose: 'MANAGE_BOOKING' },
      }),
    ).toBe(1);
  });

  it('AC-02: proof của email khác bị 403 và không tạo booking', async () => {
    const proof = await createProof('email-a@example.test');
    const emailB = `email-b-${randomUUID()}@example.test`;
    const input = holdInput(
      {
        otpProof: proof.otpProof,
        checkoutIntentId: proof.checkoutIntentId,
        recoverySecret: proof.recoverySecret,
      },
      emailB,
    );
    await expectHttpError(
      guestA.execute(input),
      403,
      'OTP_PROOF_EMAIL_MISMATCH',
    );
    expect(
      await prismaA.booking.count({ where: { customerEmail: emailB } }),
    ).toBe(0);
  });

  it('AC-06/AC-07: resume đúng secret, sai secret bị 403', async () => {
    const { identity, result } = await newHold(
      `resume-${randomUUID()}@example.test`,
    );
    const resumed = await resume.execute({
      checkoutIntentId: identity.checkoutIntentId,
      recoverySecret: identity.recoverySecret,
    });
    expect(resumed.bookingId).toBe(result.bookingId);
    expect(
      await prismaA.booking.count({ where: { id: result.bookingId } }),
    ).toBe(1);

    await expectHttpError(
      resume.execute({
        checkoutIntentId: identity.checkoutIntentId,
        recoverySecret: 'y'.repeat(64),
      }),
      403,
      'RECOVERY_SECRET_INVALID',
    );
  });

  it('P2-2: resume-intent từ chối checkoutIntentId không phải UUID', async () => {
    await expectHttpError(
      resume.execute({
        checkoutIntentId: 'not-a-uuid-but-long-enough',
        recoverySecret: 'x'.repeat(64),
      }),
      400,
      'INVALID_CHECKOUT_INTENT_ID',
    );
  });

  it('AC-03/AC-16: replay sau proof hết hạn vẫn trả booking; token hết hạn 10 phút', async () => {
    const { identity, input, result } = await newHold(
      `replay-${randomUUID()}@example.test`,
    );
    await prismaA.guestOtpProof.update({
      where: { id: identity.proofId },
      data: { status: 'EXPIRED' },
    });
    const replay = await guestA.execute({
      ...input,
      idempotencyKey: randomUUID(),
    });
    expect(replay.bookingId).toBe(result.bookingId);
    // Token cấp lại vẫn neo vào hold gốc (booking.createdAt), không gia hạn;
    // lệch mili-giây so với lần phát đầu là do clock_timestamp vs now().
    expect(
      Math.abs(
        Date.parse(replay.checkoutTokenExpiresAt) -
          Date.parse(result.checkoutTokenExpiresAt),
      ),
    ).toBeLessThan(5_000);

    await prismaA.booking.update({
      where: { id: result.bookingId },
      data: { createdAt: new Date(Date.now() - 11 * 60_000) },
    });
    await expectHttpError(
      resume.execute({
        checkoutIntentId: identity.checkoutIntentId,
        recoverySecret: identity.recoverySecret,
      }),
      401,
      'RECOVERY_TOKEN_EXPIRED',
    );
  });

  it('AC-17/AC-16: checkout token sai booking/không hợp lệ bị chặn', async () => {
    const first = await newHold(`scope-a-${randomUUID()}@example.test`);
    const second = await newHold(`scope-b-${randomUUID()}@example.test`);
    expect(
      await tokensA.verifyCheckoutToken(
        first.result.checkoutToken,
        first.result.bookingId,
      ),
    ).toMatchObject({ ok: true });
    expect(
      await tokensA.verifyCheckoutToken(
        first.result.checkoutToken,
        second.result.bookingId,
      ),
    ).toEqual({ ok: false, reason: 'BOOKING_MISMATCH' });

    const raw = randomBytes(32).toString('hex');
    const expiredCreatedAt = new Date(Date.now() - 20 * 60_000);
    await prismaA.bookingAccessToken.create({
      data: {
        bookingId: first.result.bookingId,
        purpose: 'CHECKOUT_RECOVERY',
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        // CHECK (expires_at > created_at) vẫn đúng; hạn đã trôi qua.
        createdAt: expiredCreatedAt,
        expiresAt: new Date(expiredCreatedAt.getTime() + 10 * 60_000),
      },
    });
    expect(
      await tokensA.verifyCheckoutToken(raw, first.result.bookingId),
    ).toEqual({ ok: false, reason: 'EXPIRED' });

    // P3-2: path/bookingId có thể viết hoa cùng một UUID; vẫn phải khớp.
    expect(
      await tokensA.verifyCheckoutToken(
        first.result.checkoutToken,
        first.result.bookingId.toUpperCase(),
      ),
    ).toMatchObject({ ok: true });
  });

  it('AC-10/AC-11: cancel-hold giải phóng occupancy và idempotent', async () => {
    const { result } = await newHold(`cancel-${randomUUID()}@example.test`);
    const first = await cancelHold.execute(result.bookingId);
    expect(first).toMatchObject({ status: 'CANCELLED', idempotent: false });
    const booking = await prismaA.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
    });
    expect(booking.status).toBe('CANCELLED');
    expect(
      await prismaA.courtOccupancy.count({
        where: {
          bookingId: result.bookingId,
          state: 'RELEASED',
          releasedAt: { not: null },
        },
      }),
    ).toBe(1);
    expect(
      await prismaA.bookingStatusHistory.count({
        where: { bookingId: result.bookingId, toStatus: 'CANCELLED' },
      }),
    ).toBe(1);

    const again = await cancelHold.execute(result.bookingId);
    expect(again).toMatchObject({ status: 'CANCELLED', idempotent: true });

    // Khung giờ đã mở lại: hold mới CÙNG slot phải tạo được (occupancy cũ đã
    // RELEASED nên exclusion constraint chỉ xét ACTIVE).
    const email = `rebook-${randomUUID()}@example.test`;
    const identity = await createProof(email);
    const { otpProof, checkoutIntentId, recoverySecret } = identity;
    const rebook = await guestA.execute({
      courtId: fixtures.courtId,
      startsAt: booking.startsAt.toISOString(),
      endsAt: booking.endsAt.toISOString(),
      customerName: 'Rebook Guest',
      customerPhone: '+84912345678',
      customerEmail: email,
      prepaymentPercent: 30,
      idempotencyKey: randomUUID(),
      otpProof,
      checkoutIntentId,
      recoverySecret,
    });
    expect(rebook.bookingId).not.toBe(result.bookingId);
  });

  it('AC-15/P1-1: cancel-hold sau khi hold hết hạn trả 409 CHECKOUT_READ_ONLY', async () => {
    const { result } = await newHold(`readonly-${randomUUID()}@example.test`);
    // Token còn hạn (createdAt + 10 phút) nhưng hold đã hết hạn: đúng cửa sổ
    // AC-15. CHECK hold_expires_at > created_at vẫn thỏa.
    await prismaA.booking.update({
      where: { id: result.bookingId },
      data: {
        createdAt: new Date(Date.now() - 6 * 60_000),
        holdExpiresAt: new Date(Date.now() - 1 * 60_000),
      },
    });

    await expectHttpError(
      cancelHold.execute(result.bookingId),
      409,
      'CHECKOUT_READ_ONLY',
    );
    const booking = await prismaA.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
    });
    expect(booking.status).toBe('HOLDING');
    expect(
      await prismaA.courtOccupancy.count({
        where: { bookingId: result.bookingId, state: 'ACTIVE' },
      }),
    ).toBe(1);

    // Đơn terminal vẫn idempotent thành công dù đã quá cửa sổ hold.
    await prismaA.booking.update({
      where: { id: result.bookingId },
      data: { status: 'EXPIRED' },
    });
    const terminal = await cancelHold.execute(result.bookingId);
    expect(terminal).toMatchObject({ status: 'EXPIRED', idempotent: true });
  });

  it('AC-12: cancel sau khi đã CONFIRMED trả 409 ALREADY_PAID', async () => {
    const { result } = await newHold(`paid-${randomUUID()}@example.test`);
    await prismaA.booking.update({
      where: { id: result.bookingId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await expectHttpError(
      cancelHold.execute(result.bookingId),
      409,
      'ALREADY_PAID',
    );
    const booking = await prismaA.booking.findUniqueOrThrow({
      where: { id: result.bookingId },
    });
    expect(booking.status).toBe('CONFIRMED');
  });

  it('AC-14/AC-15: recovery snapshot dùng server clock và khóa mutation khi hết hạn', async () => {
    const { result } = await newHold(`recovery-${randomUUID()}@example.test`);
    const live = await recovery.execute(result.bookingId);
    expect(live.booking.status).toBe('HOLDING');
    expect(live.payment).toBeNull();
    expect(live.allowedActions.canCancelHold).toBe(true);
    expect(live.allowedActions.canShowQr).toBe(false);
    expect(live.serverClock.remainingHoldSeconds).toBeGreaterThan(240);
    expect(live.serverClock.remainingHoldSeconds).toBeLessThanOrEqual(300);

    const required = live.booking.prepaymentAmount;
    await prismaA.paymentRequest.create({
      data: {
        paymentCode: `PAY-${randomUUID().slice(0, 20).toUpperCase()}`,
        referenceType: 'BOOKING',
        referenceId: result.bookingId,
        purpose: 'PREPAYMENT',
        amount: required,
        method: 'PAYOS_TRANSFER',
        provider: 'PAYOS',
        providerChannelId: 'test-channel',
        status: 'PENDING',
        vietQrPayload: '00020101021226',
        idempotencyKey: randomUUID(),
        expiresAt: new Date(Date.now() + 5 * 60_000),
      },
    });
    const withQr = await recovery.execute(result.bookingId);
    expect(withQr.payment).toMatchObject({
      status: 'PENDING',
      outcomeScreen: 'SCR_PENDING',
    });
    expect(withQr.allowedActions.canShowQr).toBe(true);
    expect(withQr.allowedActions.canPay).toBe(true);

    await prismaA.booking.update({
      where: { id: result.bookingId },
      data: {
        status: 'EXPIRED',
        // CHECK hold_expires_at > created_at; dời cả mốc tạo để mô phỏng hold
        // đã hết hạn từ trước.
        createdAt: new Date(Date.now() - 11 * 60_000),
        holdExpiresAt: new Date(Date.now() - 6 * 60_000),
      },
    });
    const terminal = await recovery.execute(result.bookingId);
    expect(terminal.booking.status).toBe('EXPIRED');
    expect(terminal.allowedActions.canCancelHold).toBe(false);
    expect(terminal.allowedActions.canPay).toBe(false);
    expect(terminal.allowedActions.canShowQr).toBe(false);
    expect(terminal.serverClock.isHoldExpired).toBe(true);
  });

  it('reconcile chỉ expire housekeeping và báo orphan, không sửa tài chính', async () => {
    const expired = await prismaA.guestOtpProof.create({
      data: {
        email: 'reconcile-expired@example.test',
        purpose: 'GUEST_HOLD_CREATE',
        tokenHash: randomBytes(32).toString('hex'),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const orphan = await prismaA.guestOtpProof.create({
      data: {
        email: 'reconcile-orphan@example.test',
        purpose: 'GUEST_HOLD_CREATE',
        tokenHash: randomBytes(32).toString('hex'),
        status: 'CONSUMED',
        consumedAt: new Date(),
        fencingGeneration: 1n,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const { identity, result } = await newHold(
      `reconcile-${randomUUID()}@example.test`,
    );
    await prismaA.guestOtpProof.update({
      where: { id: identity.proofId },
      data: { status: 'EXPIRED' },
    });

    const report = await reconcile.run();
    expect(report.expiredProofs).toBeGreaterThanOrEqual(1);
    expect(report.consumedProofsWithoutIntent).toContain(orphan.id);
    expect(report.intentsWithoutConsumedProof).toContain(
      identity.checkoutIntentId,
    );
    expect(
      await prismaA.guestOtpProof.findUniqueOrThrow({
        where: { id: expired.id },
      }),
    ).toMatchObject({ status: 'EXPIRED' });
    // Không đụng booking/dữ liệu tiền.
    expect(
      await prismaA.booking.findUniqueOrThrow({
        where: { id: result.bookingId },
      }),
    ).toMatchObject({ status: 'HOLDING' });
    expect(
      await prismaA.booking.count({ where: { id: result.bookingId } }),
    ).toBe(1);
  });
});
