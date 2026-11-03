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
import type { Job } from 'bullmq';
import { CourtsModule } from '../src/modules/courts/courts.module.js';
import { PaymentsModule } from '../src/modules/payments/payments.module.js';
import { PrismaModule } from '../src/infrastructure/prisma/prisma.module.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisModule } from '../src/infrastructure/redis/redis.module.js';
import { QueueModule } from '../src/infrastructure/queue/queue.module.js';
import { CreatePaymentRequestUseCase } from '../src/modules/payments/application/create-payment-request.use-case.js';
import { SimulateDemoPaymentUseCase } from '../src/modules/payments/application/simulate-demo-payment.use-case.js';
import { PaymentsWorker } from '../src/modules/payments/application/payments-workers.js';
import { PayosDemoSigner } from '../src/modules/payments/infrastructure/payos-demo-signer.js';
import { PayosWebhookInbox } from '../src/modules/payments/infrastructure/payos-webhook-inbox.js';

/**
 * BE-PAY-DEMO integration trên PostgreSQL/Redis thật (review F01–F06, F08).
 * - Gateway provider KHÔNG cấu hình (không merchant key thật) + cờ demo bật:
 *   intent tạo link demo cục bộ, simulate ký HMAC-SHA256 và xử lý qua
 *   canonical receipt path, worker scanner thật phục hồi event.
 * - Mọi assertion đọc lại DB (receipt/booking/outcome), không suy từ response.
 * - Gated loopback như spec payments hiện có; thiếu storage thì skip.
 */
const databaseUrl = process.env.BOOKING_DATABASE_TEST_URL;
const redisUrl = process.env.BOOKING_REDIS_TEST_URL;
const storageDescribe = databaseUrl && redisUrl ? describe : describe.skip;

const branchId = randomUUID();
const courtId = randomUUID();
const memberId = randomUUID();
const branchCode = `Q-DMO-${branchId.slice(0, 8)}`;

let ownedBookingIds: string[] = [];
let slotSeq = 100;
function nextSlot(): { startsAt: Date; endsAt: Date; occupiedUntil: Date } {
  const base = Date.UTC(2035, 5, 1, 1, 0, 0) + slotSeq * 3 * 3_600_000;
  slotSeq += 1;
  return {
    startsAt: new Date(base),
    endsAt: new Date(base + 3_600_000),
    occupiedUntil: new Date(base + 75 * 60_000),
  };
}

async function makeBooking(
  prisma: PrismaService,
  userId: string | null,
): Promise<string> {
  const now = new Date();
  const slot = nextSlot();
  const row = await prisma.booking.create({
    data: {
      bookingCode: `BK-${randomUUID().replaceAll('-', '').slice(0, 24)}`,
      userId,
      courtId,
      branchId,
      source: 'CUSTOMER_WEB',
      customerName: 'Demo Showcase',
      customerEmail: 'demo@example.test',
      customerPhone: '0900000002',
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      cleanupMinutes: 15,
      totalAmount: 150_000,
      prepaymentPercent: 30,
      requiredPrepaymentAmount: 45_000,
      status: 'HOLDING',
      holdExpiresAt: new Date(now.getTime() + 300_000),
      cancellationRule: 'BEFORE_START',
      cancellationDeadlineAt: slot.startsAt,
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
      occupiedFrom: slot.startsAt,
      occupiedUntil: slot.occupiedUntil,
    },
  });
  ownedBookingIds.push(row.id);
  return row.id;
}

async function receiptCount(
  prisma: PrismaService,
  requestId: string,
): Promise<number> {
  return prisma.paymentTransaction.count({
    where: { paymentRequestId: requestId },
  });
}

storageDescribe('PayOS demo simulation on real PG/Redis', () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let createRequest: CreatePaymentRequestUseCase;
  let simulate: SimulateDemoPaymentUseCase;
  let signer: PayosDemoSigner;
  let inbox: PayosWebhookInbox;
  let worker: PaymentsWorker;

  beforeAll(async () => {
    const database = new URL(databaseUrl ?? '');
    const redis = new URL(redisUrl ?? '');
    if (
      !['127.0.0.1', 'localhost'].includes(database.hostname) ||
      database.pathname !== '/booking_mvp_test' ||
      !['127.0.0.1', 'localhost'].includes(redis.hostname)
    ) {
      throw new Error(
        'Only loopback booking_mvp_test and explicit test Redis are allowed.',
      );
    }
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
              SMTP_FROM: 'no-reply@example.test',
              SMTP_HOST: '127.0.0.1',
              SMTP_PORT: '1025',
              // Cố ý KHÔNG đặt PAYOS_CLIENT_ID/API_KEY: provider thật chưa
              // cấu hình, demo dùng link/signer cục bộ (F02).
              PAYOS_CHECKSUM_KEY: 'demo-checksum-key-for-tests-only',
              PAYOS_CHANNEL_ID: 'PAYOS',
              ENABLE_PAYMENT_SIMULATION: 'true',
              PAYOS_DEMO_ACCOUNT_NUMBER: 'DEMO_888888',
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
    createRequest = module.get(CreatePaymentRequestUseCase);
    simulate = module.get(SimulateDemoPaymentUseCase);
    signer = module.get(PayosDemoSigner);
    inbox = module.get(PayosWebhookInbox);
    worker = module.get(PaymentsWorker);
    await prisma.branch.upsert({
      where: { code: branchCode },
      update: {},
      create: {
        id: branchId,
        code: branchCode,
        name: 'Demo branch',
        address: '123 Test',
        phone: '0900000000',
      },
    });
    await prisma.court.upsert({
      where: { id: courtId },
      update: {},
      create: { id: courtId, branchId, code: 'DEMO1', name: 'Demo court' },
    });
    await prisma.user.upsert({
      where: { id: memberId },
      update: {},
      create: {
        id: memberId,
        username: `demo-${memberId.slice(0, 8)}`,
        phone: `091${memberId.replaceAll('-', '').slice(0, 7)}`,
        email: `demo-${memberId.slice(0, 8)}@example.com`,
        passwordHash: 'test-hash',
      },
    });
  }, 120_000);

  beforeEach(async () => {
    const ids = ownedBookingIds;
    ownedBookingIds = [];
    if (ids.length > 0) {
      const requestIds = (
        await prisma.paymentRequest.findMany({
          where: { referenceId: { in: ids } },
          select: { id: true },
        })
      ).map((row) => row.id);
      const transactionIds =
        requestIds.length === 0
          ? []
          : (
              await prisma.paymentTransaction.findMany({
                where: { paymentRequestId: { in: requestIds } },
                select: { id: true },
              })
            ).map((row) => row.id);
      if (transactionIds.length > 0) {
        await prisma.paymentTransaction.deleteMany({
          where: { id: { in: transactionIds } },
        });
      }
      if (requestIds.length > 0) {
        await prisma.paymentRequest.deleteMany({
          where: { id: { in: requestIds } },
        });
      }
      await prisma.paymentAuditLog.deleteMany({
        where: { bookingId: { in: ids } },
      });
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: ids } },
      });
      await prisma.bookingStatusHistory.deleteMany({
        where: { bookingId: { in: ids } },
      });
      await prisma.courtOccupancy.deleteMany({
        where: { bookingId: { in: ids } },
      });
      await prisma.booking.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.paymentWebhookEvent.deleteMany({});
  });

  afterAll(async () => {
    await module?.close();
  });

  it('member: tạo intent demo cục bộ rồi simulate thành CONFIRMED', async () => {
    const bookingId = await makeBooking(prisma, memberId);
    const request = await createRequest.execute(
      { userId: memberId },
      {
        bookingId,
        purpose: 'PREPAYMENT',
        prepaymentPercent: 30,
        method: 'PAYOS_TRANSFER',
        idempotencyKey: `demo-intent:${bookingId}`,
        actorUserId: memberId,
      },
    );
    expect(request.status).toBe('PENDING');
    expect(request.providerPaymentLinkId ?? '').toMatch(/^DEMO_/);

    const result = await simulate.execute(request.id, {
      userId: memberId,
      actorUserId: memberId,
    });
    expect(result.status).toBe('processed');

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(String(booking.status)).toBe('CONFIRMED');
    expect(await receiptCount(prisma, request.id)).toBe(1);
    const receipt = await prisma.paymentTransaction.findFirstOrThrow({
      where: { paymentRequestId: request.id },
    });
    expect(Number(receipt.amount.toString())).toBe(45_000);
    expect(String(receipt.verificationStatus)).toBe('VERIFIED');
    expect(String(receipt.allocationStatus)).toBe('ALLOCATED');
  }, 60_000);

  it('member: simulate lại không sinh receipt thứ hai (idempotent)', async () => {
    const bookingId = await makeBooking(prisma, memberId);
    const request = await createRequest.execute(
      { userId: memberId },
      {
        bookingId,
        purpose: 'PREPAYMENT',
        prepaymentPercent: 30,
        method: 'PAYOS_TRANSFER',
        idempotencyKey: `demo-replay:${bookingId}`,
        actorUserId: memberId,
      },
    );
    await simulate.execute(request.id, {
      userId: memberId,
      actorUserId: memberId,
    });
    const replay = await simulate.execute(request.id, {
      userId: memberId,
      actorUserId: memberId,
    });
    expect(['processed', 'accepted']).toContain(replay.status);
    expect(await receiptCount(prisma, request.id)).toBe(1);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(String(booking.status)).toBe('CONFIRMED');
  }, 60_000);

  it('worker scanner thật xử lý event demo đã ingest (recovery)', async () => {
    const bookingId = await makeBooking(prisma, memberId);
    const request = await createRequest.execute(
      { userId: memberId },
      {
        bookingId,
        purpose: 'PREPAYMENT',
        prepaymentPercent: 30,
        method: 'PAYOS_TRANSFER',
        idempotencyKey: `demo-worker:${bookingId}`,
        actorUserId: memberId,
      },
    );
    const data = signer.buildDemoData({
      paymentCode: request.paymentCode,
      amount: request.amount,
      paymentLinkId: request.providerPaymentLinkId,
      occurredAt: new Date(),
    });
    const ingested = await inbox.ingest({
      data,
      signature: signer.signWebhookData(data),
    });
    expect(ingested.status).toBe('RECEIVED');

    const outcome = await worker.process({
      name: 'webhook-retry',
    } as unknown as Job);
    expect(outcome).toMatchObject({ processed: 1 });
    const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({
      where: { id: ingested.eventId },
    });
    expect(String(event.status)).toBe('PROCESSED');
    expect(await receiptCount(prisma, request.id)).toBe(1);
    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(String(booking.status)).toBe('CONFIRMED');
  }, 60_000);

  it('guest đúng booking được simulate; sai booking bị chặn', async () => {
    const bookingId = await makeBooking(prisma, null);
    const request = await createRequest.execute(
      { userId: null },
      {
        bookingId,
        purpose: 'PREPAYMENT',
        prepaymentPercent: 30,
        method: 'PAYOS_TRANSFER',
        idempotencyKey: `demo-guest:${bookingId}`,
        actorUserId: null,
      },
    );
    const ok = await simulate.execute(request.id, {
      userId: null,
      guestBookingId: bookingId,
    });
    expect(ok.status).toBe('processed');
    await expect(
      simulate.execute(request.id, {
        userId: null,
        guestBookingId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(await receiptCount(prisma, request.id)).toBe(1);
  }, 60_000);
});
