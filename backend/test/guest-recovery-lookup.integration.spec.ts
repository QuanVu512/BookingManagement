import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { GuestTokenService } from '../src/modules/payments/infrastructure/guest-token.service.js';
import { GuestRecoveryOutboxCrypto } from '../src/modules/payments/infrastructure/guest-recovery-outbox-crypto.js';
import { GuestRecoveryOutboxWriter } from '../src/modules/payments/application/guest-recovery-outbox.writer.js';
import { RequestGuestRecoveryLinkUseCase } from '../src/modules/payments/application/request-guest-recovery-link.use-case.js';
import { GUEST_LOOKUP_GENERIC_MESSAGE } from '../src/modules/payments/domain/guest-lookup-fanout-policy.js';
import { depositFixtures } from './helpers/booking-deposit.fixture.js';

/**
 * Task 5.4 — tra cứu chống dò trên PostgreSQL thật.
 * Chỉ chạy khi GUEST_RECOVERY_DATABASE_TEST_URL trỏ DB disposable đã migrate.
 * Không cần Redis (thiếu Redis thì cho qua kèm cảnh báo).
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

const storageDescribe = databaseUrl ? describe : describe.skip;

const TEST_KEYS =
  'v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

storageDescribe('tra cứu đơn giữ chỗ trên PostgreSQL thật (AC-22)', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaService;
  let useCase: RequestGuestRecoveryLinkUseCase;
  let courtId: string;
  let branchId: string;

  async function insertHold(input: {
    email?: string;
    phone?: string;
    holdMinutesFromNow?: number;
    status?: 'HOLDING' | 'CANCELLED';
  }) {
    const minutes = input.holdMinutesFromNow ?? 5;
    const holdExpiresAt = new Date(Date.now() + minutes * 60_000);
    // CHECK bookings_hold_deadline_check: holdExpiresAt > createdAt và <= startsAt.
    // CHECK bookings_cancellation_deadline_check: deadline đúng bằng startsAt.
    const dayStart = new Date(Date.now() + 24 * 3600_000);
    const created = await prisma.booking.create({
      data: {
        bookingCode: `BK-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
        userId: null,
        courtId,
        branchId,
        source: 'CUSTOMER_WEB',
        customerName: 'Khách Test',
        customerEmail: input.email ?? 'lookup@example.test',
        customerPhone: input.phone ?? '0912345678',
        startsAt: dayStart,
        endsAt: new Date(dayStart.getTime() + 3600_000),
        cleanupMinutes: 0,
        totalAmount: 300000,
        prepaymentPercent: 30,
        requiredPrepaymentAmount: 90000,
        status: 'HOLDING',
        holdExpiresAt,
        cancellationRule: 'BEFORE_START',
        cancellationDeadlineAt: dayStart,
        policyVersion: 'v1',
        policyAcceptedAt: new Date(),
        idempotencyKey: randomUUID(),
        createdAt: new Date(Math.min(Date.now(), holdExpiresAt.getTime() - 60_000)),
      },
      select: { id: true, holdExpiresAt: true, createdAt: true },
    });
    if (input.status && input.status !== 'HOLDING') {
      // CHECK bookings_cancellation_timestamp_check: CANCELLED cần cancelledAt.
      await prisma.booking.update({
        where: { id: created.id },
        data: { status: input.status, cancelledAt: new Date() },
      });
    }
    return created;
  }

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany({});
  });

  beforeAll(async () => {
    assertIsolatedDatabase(databaseUrl as string);
    const config = testConfig();
    prisma = new PrismaService(config);
    await prisma.$connect();
    const crypto = new GuestRecoveryOutboxCrypto(config);
    useCase = new RequestGuestRecoveryLinkUseCase(
      prisma,
      new GuestTokenService(prisma, config),
      new GuestRecoveryOutboxWriter(crypto),
    );
    const fixtures = await depositFixtures(prisma);
    courtId = fixtures.courtId;
    branchId = fixtures.branchId;
  });

  function testConfig() {
    return new ConfigService({
      DATABASE_URL: databaseUrl as string,
      GUEST_RECOVERY_OUTBOX_KEYS: TEST_KEYS,
      GUEST_RECOVERY_ACTIVE_KEY_VERSION: 'v1',
    } as Record<string, string>);
  }

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('P5-05 (Email tồn tại và không tồn tại trả cùng nội dung, cùng mã)', async () => {
    const email = `found-${randomUUID().slice(0, 8)}@example.test`;
    await insertHold({ email });
    const found = await useCase.execute(email);
    const missing = await useCase.execute(`nope-${randomUUID().slice(0, 8)}@example.test`);
    expect(found).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    expect(missing).toEqual(found);
  });

  it('tra cứu bằng SĐT gửi link tới email chủ đơn và ghi outbox lookup', async () => {
    const email = `owner-${randomUUID().slice(0, 8)}@example.test`;
    const phone = `09${String(Math.floor(10000000 + Math.random() * 89999999))}`;
    const hold = await insertHold({ email, phone });
    const result = await useCase.execute(phone);
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    const rows = await prisma.outboxMessage.findMany({
      where: { aggregateId: hold.id, eventType: 'guest.recovery.lookup' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('QUEUED');
  });

  it('đơn đã hủy không nhận link nhưng vẫn trả thông báo chung', async () => {
    const email = `gone-${randomUUID().slice(0, 8)}@example.test`;
    const hold = await insertHold({ email, status: 'CANCELLED' });
    const result = await useCase.execute(email);
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    const rows = await prisma.outboxMessage.findMany({
      where: { aggregateId: hold.id },
    });
    expect(rows).toHaveLength(0);
  });
});
