import 'reflect-metadata';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { PayOS } from '@payos/node';
import { CourtsModule } from '../src/modules/courts/courts.module.js';
import { PaymentsModule } from '../src/modules/payments/payments.module.js';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisModule } from '../src/infrastructure/redis/redis.module.js';
import { QueueModule } from '../src/infrastructure/queue/queue.module.js';
import { BookingConfirmationCoordinator } from '../src/modules/payments/application/booking-confirmation-coordinator.js';
import { PaymentOutcomeService } from '../src/modules/payments/application/payment-outcome.service.js';
import { StaffBalanceUseCase } from '../src/modules/payments/application/staff-balance.use-case.js';
import { StaffAllocateUseCase } from '../src/modules/payments/application/staff-allocate.use-case.js';
import { StaffRefundsUseCase } from '../src/modules/payments/application/staff-refunds.use-case.js';
import { GuestTokenService } from '../src/modules/payments/infrastructure/guest-token.service.js';
import { PayosWebhookInbox } from '../src/modules/payments/infrastructure/payos-webhook-inbox.js';

/**
 * STEP 5 — Payments integration on real PostgreSQL (BE-PAY-11, E3, BE-PAY-06).
 * Gated: chạy khi BOOKING_DATABASE_TEST_URL + BOOKING_REDIS_TEST_URL trỏ
 * loopback test DB; ngược lại skip (không fake PASS).
 */
const databaseUrl = process.env.BOOKING_DATABASE_TEST_URL;
const redisUrl = process.env.BOOKING_REDIS_TEST_URL;
const storageDescribe = databaseUrl && redisUrl ? describe : describe.skip;

const branchId = randomUUID();
const courtId = randomUUID();
const userA = randomUUID();
const userB = randomUUID();

async function fixtures(prisma: PrismaService): Promise<void> {
  await prisma.branch.upsert({
    where: { id: branchId },
    update: {},
    create: {
      id: branchId,
      code: 'Q-PAY',
      name: 'Quan Pay',
      address: '123 Test',
      phone: '0900000000',
    },
  });
  await prisma.court.upsert({
    where: { id: courtId },
    update: {},
    create: {
      id: courtId,
      branchId,
      code: 'C1',
      name: 'Court 1',
    },
  });
}

async function makeBooking(
  prisma: PrismaService,
  overrides: {
    userId?: string | null;
    holdExpiresAt?: Date;
    status?: 'HOLDING' | 'CANCELLED' | 'CONFIRMED';
    total?: number;
    required?: number;
  } = {},
): Promise<string> {
  const now = new Date();
  const row = await prisma.booking.create({
    data: {
      bookingCode: `BK-${randomUUID().replaceAll('-', '').slice(0, 24)}`,
      userId: overrides.userId ?? userA,
      courtId,
      branchId,
      source: 'CUSTOMER_WEB',
      customerName: 'Test User',
      customerEmail: 'test@example.com',
      customerPhone: '0900000001',
      startsAt: new Date('2035-01-08T01:00:00Z'),
      endsAt: new Date('2035-01-08T02:00:00Z'),
      cleanupMinutes: 15,
      totalAmount: overrides.total ?? 150_000,
      prepaymentPercent: 30,
      requiredPrepaymentAmount: overrides.required ?? 45_000,
      status: overrides.status ?? 'HOLDING',
      holdExpiresAt:
        overrides.holdExpiresAt ?? new Date(now.getTime() + 300_000),
      cancellationRule: 'BEFORE_START',
      cancellationDeadlineAt: new Date('2035-01-08T01:00:00Z'),
      policyVersion: 'test-v1',
      policyAcceptedAt: now,
      idempotencyKey: randomUUID(),
    },
    select: { id: true },
  });
  await prisma.courtOccupancy.create({
    data: {
      bookingId: row.id,
      courtId,
      kind: 'BOOKING',
      occupiedFrom: new Date('2035-01-08T01:00:00Z'),
      occupiedUntil: new Date('2035-01-08T02:15:00Z'),
    },
  });
  return row.id;
}

async function makeReceipt(
  prisma: PrismaService,
  bookingId: string,
  amount: number,
): Promise<string> {
  const request = await prisma.paymentRequest.create({
    data: {
      paymentCode: `PAY-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`,
      referenceType: 'BOOKING',
      referenceId: bookingId,
      purpose: 'PREPAYMENT',
      amount,
      currency: 'VND',
      method: 'PAYOS_TRANSFER',
      provider: 'PAYOS',
      providerChannelId: 'PAYOS',
      idempotencyKey: randomUUID(),
    },
    select: { id: true },
  });
  const receipt = await prisma.paymentTransaction.create({
    data: {
      paymentRequestId: request.id,
      provider: 'PAYOS',
      method: 'BANK_TRANSFER',
      receivingAccountKey: 'PAYOS:123456',
      transactionReference: `FT${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`,
      amount,
      currency: 'VND',
      verificationStatus: 'VERIFIED',
      allocationStatus: 'ALLOCATED',
      confirmationSource: 'WEBHOOK',
      fundsReceivedAt: new Date(),
      idempotencyKey: randomUUID(),
    },
    select: { id: true },
  });
  return receipt.id;
}

storageDescribe('Payments coordinator + outcome + guest token (real PG)', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let coordinator: BookingConfirmationCoordinator;
  let outcomes: PaymentOutcomeService;
  let tokens: GuestTokenService;
  let inbox: PayosWebhookInbox;
  let staffBalance: StaffBalanceUseCase;
  let staffAllocate: StaffAllocateUseCase;
  let staffRefunds: StaffRefundsUseCase;

  beforeAll(async () => {
    const database = new URL(databaseUrl ?? '');
    const redis = new URL(redisUrl ?? '');
    if (
      !['127.0.0.1', 'localhost'].includes(database.hostname) ||
      database.pathname !== '/booking_mvp_test' ||
      !['127.0.0.1', 'localhost'].includes(redis.hostname)
    )
      throw new Error(
        'Only loopback booking_mvp_test and explicit test Redis are allowed.',
      );
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              NODE_ENV: 'test',
              DATABASE_URL: databaseUrl,
              REDIS_URL: redisUrl,
              REDIS_HOST: redis.hostname,
              REDIS_PORT: redis.port,
              JWT_SECRET: randomBytes(32).toString('hex'),
              WEB_ORIGIN: 'http://127.0.0.1:4001',
              PAYOS_CLIENT_ID: 'test-client',
              PAYOS_API_KEY: 'test-key',
              PAYOS_CHECKSUM_KEY: 'test-checksum-key-1234567890',
            }),
          ],
        }),
        PrismaModule,
        RedisModule,
        QueueModule,
        CourtsModule,
        PaymentsModule,
      ],
    }).compile();
    prisma = module.get(PrismaService);
    coordinator = module.get(BookingConfirmationCoordinator);
    outcomes = module.get(PaymentOutcomeService);
    tokens = module.get(GuestTokenService);
    inbox = module.get(PayosWebhookInbox);
    staffBalance = module.get(StaffBalanceUseCase);
    staffAllocate = module.get(StaffAllocateUseCase);
    staffRefunds = module.get(StaffRefundsUseCase);
    await fixtures(prisma);
  }, 60_000);

  beforeEach(async () => {
    await prisma.refundAttempt.deleteMany({});
    await prisma.refundRequest.deleteMany({});
    await prisma.paymentTransaction.deleteMany({});
    await prisma.paymentWebhookEvent.deleteMany({});
    await prisma.paymentRequest.deleteMany({});
    await prisma.paymentAuditLog.deleteMany({});
    await prisma.outboxEvent.deleteMany({});
    await prisma.bookingStatusHistory.deleteMany({});
    await prisma.courtOccupancy.deleteMany({ where: { bookingId: { not: undefined } } });
    await prisma.bookingAccessToken.deleteMany({});
    await prisma.booking.deleteMany({});
  });

  afterAll(async () => {
    await module?.close();
  });

  it('confirm trước hạn khi đủ tiền verified', async () => {
    const bookingId = await makeBooking(prisma);
    await makeReceipt(prisma, bookingId, 45_000);
    const result = await coordinator.confirmIfEligible(bookingId);
    expect(result).toEqual({ result: 'CONFIRMED' });
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(String(booking.status)).toBe('CONFIRMED');
    const history = await prisma.bookingStatusHistory.findMany({
      where: { bookingId },
    });
    expect(history.some((entry) => entry.toStatus === 'CONFIRMED')).toBe(true);
    const outbox = await prisma.outboxEvent.findMany({
      where: { aggregateId: bookingId, eventType: 'booking.confirmed' },
    });
    expect(outbox.length).toBe(1);
  });

  it('hai confirm song song chỉ một CONFIRMED', async () => {
    const bookingId = await makeBooking(prisma);
    await makeReceipt(prisma, bookingId, 45_000);
    const [first, second] = await Promise.all([
      coordinator.confirmIfEligible(bookingId),
      coordinator.confirmIfEligible(bookingId),
    ]);
    const results = [first.result, second.result].sort();
    expect(results).toEqual(['ALREADY_CONFIRMED', 'CONFIRMED']);
  });

  it('hết hạn trước rồi mới có tiền: expire tạo obligation, không confirm', async () => {
    const bookingId = await makeBooking(prisma, {
      holdExpiresAt: new Date(Date.now() - 1_000),
    });
    await makeReceipt(prisma, bookingId, 45_000);
    const exit = await coordinator.expireHoldWithObligations(bookingId);
    expect(exit.result).toBe('EXPIRED');
    if (exit.result === 'EXPIRED') expect(exit.obligationsCreated).toBe(1);
    const confirm = await coordinator.confirmIfEligible(bookingId);
    expect(confirm.result).toBe('NOT_ELIGIBLE');
    const refund = await prisma.refundRequest.findFirst({
      where: { reasonType: 'LATE_PAYMENT' },
    });
    expect(refund).not.toBeNull();
    // Idempotent rerun: không tạo obligation thứ hai.
    const rerun = await coordinator.expireHoldWithObligations(bookingId);
    expect(rerun.result).toBe('ALREADY_FINAL');
    expect(
      await prisma.refundRequest.count({
        where: { reasonType: 'LATE_PAYMENT' },
      }),
    ).toBe(1);
  });

  it('booking đã CANCELLED không bị revive', async () => {
    const bookingId = await makeBooking(prisma, { status: 'CANCELLED' });
    const confirm = await coordinator.confirmIfEligible(bookingId);
    expect(confirm.result).toBe('NOT_ELIGIBLE');
    const exit = await coordinator.expireHoldWithObligations(bookingId);
    expect(exit).toMatchObject({ result: 'ALREADY_FINAL', status: 'CANCELLED' });
  });

  it('guest token: hợp lệ, sai booking, revoke, hết hạn đều đúng', async () => {
    const bookingId = await makeBooking(prisma, { userId: null });
    const otherId = await makeBooking(prisma, { userId: null });
    const startsAt = new Date('2035-01-08T01:00:00Z');
    const issued = await tokens.issueManageToken({ bookingId, startsAt });
    expect(
      await tokens.verifyManageToken(issued.rawToken, bookingId),
    ).toMatchObject({ bookingId });
    expect(await tokens.verifyManageToken(issued.rawToken, otherId)).toBeNull();
    await tokens.revokeToken(issued.tokenId);
    expect(await tokens.verifyManageToken(issued.rawToken, bookingId)).toBeNull();
    // Hết hạn: insert trực tiếp token quá hạn.
    const { createHash } = await import('node:crypto');
    const raw = `${'a'.repeat(64)}`;
    await prisma.bookingAccessToken.create({
      data: {
        bookingId,
        purpose: 'MANAGE_BOOKING',
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    expect(await tokens.verifyManageToken(raw, bookingId)).toBeNull();
  });

  it('outcome ownership: chủ thấy, người khác 404, guest bind thấy', async () => {
    const bookingId = await makeBooking(prisma);
    await makeReceipt(prisma, bookingId, 45_000);
    const request = await prisma.paymentRequest.findFirstOrThrow({
      where: { referenceId: bookingId },
    });
    const mine = await outcomes.statusForRequest(request.id, { userId: userA });
    expect(mine?.bookingStatus).toBe('HOLDING');
    expect(mine?.paidAmount).toBe(45_000);
    expect(mine?.remainingAmount).toBe(105_000);
    expect(await outcomes.statusForRequest(request.id, { userId: userB })).toBeNull();
    const issued = await tokens.issueManageToken({
      bookingId,
      startsAt: new Date('2035-01-08T01:00:00Z'),
    });
    const verified = await tokens.verifyManageToken(issued.rawToken, bookingId);
    expect(verified).not.toBeNull();
    const guest = await outcomes.statusForRequest(request.id, {
      userId: null,
      guestBookingId: verified?.bookingId,
    });
    expect(guest?.paidAmount).toBe(45_000);
  });

  it('duplicate webhook delivery chỉ một receipt', async () => {
    const bookingId = await makeBooking(prisma);
    const request = await prisma.paymentRequest.create({
      data: {
        paymentCode: 'PAY-DUPTEST01',
        referenceType: 'BOOKING',
        referenceId: bookingId,
        purpose: 'PREPAYMENT',
        amount: 45_000,
        currency: 'VND',
        method: 'PAYOS_TRANSFER',
        provider: 'PAYOS',
        providerChannelId: 'PAYOS',
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    void request;
    const client = new PayOS({
      clientId: 'test-client',
      apiKey: 'test-key',
      checksumKey: 'test-checksum-key-1234567890',
    });
    const data = {
      orderCode: 123456,
      amount: 45_000,
      description: 'PAY-DUPTEST01 thanh toan coc',
      reference: 'FTDUPTEST0001',
      accountNumber: '123456',
      code: '00',
      desc: 'success',
    };
    const signature = await client.crypto.createSignatureFromObj(
      data,
      'test-checksum-key-1234567890',
    );
    const envelope = { code: '00', desc: 'success', success: true, data, signature };
    const first = await inbox.ingest(envelope);
    expect(first.status).toBe('RECEIVED');
    const second = await inbox.ingest(envelope);
    expect(second.status).toBe('DUPLICATE');
    expect(second.eventId).toBe(first.eventId);
  });

  it('E14 thu CASH theo dư nợ server + replay idempotent', async () => {
    const staffId = randomUUID();
    const bookingId = await makeBooking(prisma);
    const first = await staffBalance.execute({
      bookingId,
      method: 'CASH',
      idempotencyKey: randomUUID(),
      staffUserId: staffId,
    });
    expect(first.amount).toBe(150_000);
    const replay = await staffBalance.execute({
      bookingId,
      method: 'CASH',
      idempotencyKey: (await prisma.paymentRequest.findUniqueOrThrow({
        where: { id: first.requestId },
        select: { idempotencyKey: true },
      })).idempotencyKey,
      staffUserId: staffId,
    });
    expect(replay.requestId).toBe(first.requestId);
    const receipt = await prisma.paymentTransaction.findUniqueOrThrow({
      where: { id: first.receiptId as string },
    });
    expect(String(receipt.verificationStatus)).toBe('VERIFIED');
    expect(String(receipt.allocationStatus)).toBe('ALLOCATED');
    expect(receipt.verifiedByUserId).toBe(staffId);
  });

  it('E14 stale amount và đã đủ tiền bị từ chối', async () => {
    const staffId = randomUUID();
    const bookingId = await makeBooking(prisma);
    await expect(
      staffBalance.execute({
        bookingId,
        method: 'CASH',
        amount: 1,
        idempotencyKey: randomUUID(),
        staffUserId: staffId,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('PAYMENT_AMOUNT_STALE') });
    await staffBalance.execute({
      bookingId,
      method: 'CASH',
      idempotencyKey: randomUUID(),
      staffUserId: staffId,
    });
    await expect(
      staffBalance.execute({
        bookingId,
        method: 'CASH',
        idempotencyKey: randomUUID(),
        staffUserId: staffId,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('BALANCE_ALREADY_PAID') });
  });

  it('E16 allocate guards: chưa verify / đã allocate / refund flow', async () => {
    const staffId = randomUUID();
    const bookingId = await makeBooking(prisma);
    const request = await prisma.paymentRequest.create({
      data: {
        paymentCode: `PAY-${randomUUID().replaceAll('-', '').slice(0, 24).toUpperCase()}`,
        referenceType: 'BOOKING',
        referenceId: bookingId,
        purpose: 'BALANCE',
        amount: 150_000,
        currency: 'VND',
        method: 'MANUAL_BANK_TRANSFER',
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    const unverified = await prisma.paymentTransaction.create({
      data: {
        paymentRequestId: request.id,
        method: 'BANK_TRANSFER',
        receivingAccountKey: 'MANUAL:COUNTER',
        transactionReference: `REF-${randomUUID().slice(0, 8)}`,
        amount: 150_000,
        currency: 'VND',
        verificationStatus: 'UNVERIFIED',
        allocationStatus: 'UNALLOCATED',
        confirmationSource: 'STAFF',
        fundsReceivedAt: new Date(),
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    await expect(
      staffAllocate.execute({
        receiptId: unverified.id,
        paymentRequestId: request.id,
        idempotencyKey: randomUUID(),
        staffUserId: staffId,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('RECEIPT_NOT_VERIFIED') });

    await prisma.paymentTransaction.update({
      where: { id: unverified.id },
      data: { verificationStatus: 'VERIFIED' },
    });
    const allocated = await staffAllocate.execute({
      receiptId: unverified.id,
      paymentRequestId: request.id,
      idempotencyKey: randomUUID(),
      staffUserId: staffId,
    });
    expect(allocated.status).toBe('ALLOCATED');
    await expect(
      staffAllocate.execute({
        receiptId: unverified.id,
        paymentRequestId: request.id,
        idempotencyKey: randomUUID(),
        staffUserId: staffId,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('RECEIPT_ALREADY_ALLOCATED') });

    // Receipt trong refund flow bị chặn.
    const receipt2 = await prisma.paymentTransaction.create({
      data: {
        paymentRequestId: request.id,
        method: 'BANK_TRANSFER',
        receivingAccountKey: 'MANUAL:COUNTER',
        transactionReference: `REF-${randomUUID().slice(0, 8)}`,
        amount: 10_000,
        currency: 'VND',
        verificationStatus: 'VERIFIED',
        allocationStatus: 'UNALLOCATED',
        confirmationSource: 'STAFF',
        fundsReceivedAt: new Date(),
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    await prisma.refundRequest.create({
      data: {
        paymentTransactionId: receipt2.id,
        reasonType: 'OVERPAYMENT',
        reason: 'test',
        amount: 10_000,
        currency: 'VND',
        method: 'MANUAL_BANK_TRANSFER',
        status: 'REQUESTED',
        idempotencyKey: randomUUID(),
      },
    });
    await expect(
      staffAllocate.execute({
        receiptId: receipt2.id,
        paymentRequestId: request.id,
        idempotencyKey: randomUUID(),
        staffUserId: staffId,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('RECEIPT_IN_REFUND_FLOW') });
  });

  it('E18/E19 four-eyes, double-approve, reject chặn attempt live', async () => {
    const requester = randomUUID();
    const approver = randomUUID();
    const bookingId = await makeBooking(prisma);
    const receiptId = await makeReceipt(prisma, bookingId, 45_000);
    const refund = await prisma.refundRequest.create({
      data: {
        paymentTransactionId: receiptId,
        reasonType: 'LATE_PAYMENT',
        reason: 'test',
        amount: 45_000,
        currency: 'VND',
        method: 'MANUAL_BANK_TRANSFER',
        status: 'REQUESTED',
        requestedByUserId: requester,
        idempotencyKey: randomUUID(),
      },
      select: { id: true },
    });
    await expect(
      staffRefunds.approve({
        refundId: refund.id,
        idempotencyKey: randomUUID(),
        approverUserId: requester,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('SELF_APPROVAL_FORBIDDEN') });
    const approved = await staffRefunds.approve({
      refundId: refund.id,
      idempotencyKey: randomUUID(),
      approverUserId: approver,
      destination: { bankBin: '970422', accountLast4: '7890', accountName: 'Test' },
    });
    expect(approved.status).toBe('APPROVED');
    await expect(
      staffRefunds.approve({
        refundId: refund.id,
        idempotencyKey: randomUUID(),
        approverUserId: approver,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('REFUND_ALREADY_CLOSED') });

    // Attempt live chặn reject.
    await prisma.refundAttempt.create({
      data: {
        refundRequestId: refund.id,
        attemptNumber: 1,
        method: 'MANUAL_BANK_TRANSFER',
        referenceId: `MAN-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
        idempotencyKey: randomUUID(),
        sourceAccountKey: 'CASH:COUNTER',
        amount: 45_000,
        currency: 'VND',
        status: 'CREATED',
      },
    });
    await expect(
      staffRefunds.reject({
        refundId: refund.id,
        rejectionReason: 'sai thông tin',
        idempotencyKey: randomUUID(),
        actorUserId: approver,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('REFUND_ATTEMPT_IN_FLIGHT') });
  });

  it('E4 detail mask reference; E12 lookup + audit', async () => {
    const bookingId = await makeBooking(prisma);
    await makeReceipt(prisma, bookingId, 45_000);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    const detail = await outcomes.bookingDetail(bookingId, { userId: userA });
    expect(detail?.paymentSummary.paidAmount).toBe(45_000);
    expect(detail?.paymentSummary.balanceAmount).toBe(105_000);
    expect(detail?.transactions[0]?.transactionReference).toMatch(/^\*\*\*\*/);
    expect(await outcomes.bookingDetail(bookingId, { userId: userB })).toBeNull();

    const lookup = await outcomes.staffLookup(booking.bookingCode);
    expect(lookup?.dto.customerPhoneLast4).toBe(
      booking.customerPhone.slice(-4),
    );
    expect(lookup?.dto.customerName).toBe(booking.customerName);
  });
});
