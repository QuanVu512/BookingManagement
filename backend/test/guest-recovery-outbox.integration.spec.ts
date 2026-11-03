import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { GuestRecoveryOutboxCrypto } from '../src/modules/payments/infrastructure/guest-recovery-outbox-crypto.js';
import { GuestRecoveryMailService } from '../src/modules/payments/infrastructure/guest-recovery-mail.service.js';
import { GuestRecoveryOutboxWriter } from '../src/modules/payments/application/guest-recovery-outbox.writer.js';
import { GuestRecoveryMailWorker } from '../src/modules/payments/application/guest-recovery-mail.worker.js';
import { depositFixtures } from './helpers/booking-deposit.fixture.js';

/**
 * Task 5.4 — tích hợp DB thật cho outbox thư phục hồi.
 * Chỉ chạy khi GUEST_RECOVERY_DATABASE_TEST_URL trỏ DB disposable đã migrate
 * (vd: DB test chạy qua `npm run db:test:create` + `npm run prisma:test:deploy`
 * vào DB riêng, hoặc DB disposable do người chạy chuẩn bị). Không fallback DB
 * ứng dụng. Không cần Redis (worker chỉ dùng PostgreSQL + SMTP giả bộ nhớ).
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

function testConfig(extra: Record<string, string> = {}) {
  return new ConfigService({
    GUEST_RECOVERY_OUTBOX_KEYS: TEST_KEYS,
    GUEST_RECOVERY_ACTIVE_KEY_VERSION: 'v1',
    GUEST_RECOVERY_MAIL_MEMORY: 'true',
    WEB_ORIGIN: 'http://localhost:4001',
    ...extra,
  } as Record<string, string>);
}

storageDescribe('guest recovery outbox trên PostgreSQL thật', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaService;
  let crypto: GuestRecoveryOutboxCrypto;
  let writer: GuestRecoveryOutboxWriter;
  let courtId: string;
  let branchId: string;

  async function insertHold(input: {
    email?: string;
    holdMinutesFromNow?: number;
    status?: 'HOLDING' | 'CANCELLED' | 'EXPIRED' | 'CONFIRMED';
  }) {
    const minutes = input.holdMinutesFromNow ?? 5;
    const holdExpiresAt = new Date(Date.now() + minutes * 60_000);
    // CHECK bookings_hold_deadline_check: holdExpiresAt > createdAt và <= startsAt.
    const createdAt = new Date(
      Math.min(Date.now(), holdExpiresAt.getTime() - 60_000),
    );
    // CHECK bookings_cancellation_deadline_check: deadline phải đúng bằng startsAt.
    const dayStart = new Date(Date.now() + 24 * 3600_000);
    const booking = await prisma.booking.create({
      data: {
        bookingCode: `BK-${randomUUID().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
        userId: null,
        courtId,
        branchId,
        source: 'CUSTOMER_WEB',
        customerName: 'Khách Test',
        customerEmail: input.email ?? 'guest@example.test',
        customerPhone: '+84901234567',
        startsAt: dayStart,
        endsAt: new Date(dayStart.getTime() + 3600_000),
        cleanupMinutes: 0,
        totalAmount: 300000,
        prepaymentPercent: 30,
        requiredPrepaymentAmount: 90000,
        status: input.status ?? 'HOLDING',
        holdExpiresAt,
        cancellationRule: 'BEFORE_START',
        cancellationDeadlineAt: dayStart,
        policyVersion: 'v1',
        policyAcceptedAt: new Date(),
        idempotencyKey: randomUUID(),
        createdAt,
      },
      select: { id: true, holdExpiresAt: true },
    });
    return booking;
  }

  beforeEach(async () => {
    // Cô lập từng bài: worker claim mọi bản ghi đến hạn nên phải dọn outbox cũ.
    await prisma.outboxMessage.deleteMany({});
  });

  beforeAll(async () => {
    assertIsolatedDatabase(databaseUrl as string);
    const config = testConfig({ DATABASE_URL: databaseUrl as string });
    prisma = new PrismaService(config);
    await prisma.$connect();
    crypto = new GuestRecoveryOutboxCrypto(config);
    writer = new GuestRecoveryOutboxWriter(crypto);
    const fixtures = await depositFixtures(prisma);
    courtId = fixtures.courtId;
    branchId = fixtures.branchId;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('P5-03 (Rollback transaction thì không còn bản ghi outbox)', async () => {
    const hold = await insertHold({});
    await expect(
      prisma.$transaction(async (tx) => {
        await writer.writeInTransaction(tx, {
          bookingId: hold.id,
          email: 'guest@example.test',
          token: 't'.repeat(64),
          eventType: 'guest.recovery.invite',
          expiresAt: hold.holdExpiresAt,
        });
        throw new Error('ép rollback');
      }),
    ).rejects.toThrow('ép rollback');
    const leftovers = await prisma.outboxMessage.findMany({
      where: { aggregateId: hold.id },
    });
    expect(leftovers).toHaveLength(0);
  });

  it('P5-04 (Replay ghi cùng dedup key chỉ còn 1 bản ghi)', async () => {
    const hold = await insertHold({});
    const input = {
      bookingId: hold.id,
      email: 'guest@example.test',
      token: 't'.repeat(64),
      eventType: 'guest.recovery.invite' as const,
      expiresAt: hold.holdExpiresAt,
    };
    await prisma.$transaction((tx) => writer.writeInTransaction(tx, input));
    await prisma.$transaction((tx) => writer.writeInTransaction(tx, input));
    const rows = await prisma.outboxMessage.findMany({
      where: { aggregateId: hold.id },
    });
    expect(rows).toHaveLength(1);
  });

  it('AC-20 (Worker gửi bù sau crash: QUEUED và SENDING kẹt đều được gửi)', async () => {
    const mail = new GuestRecoveryMailService(testConfig());
    const worker = new GuestRecoveryMailWorker(prisma, crypto, mail);
    const first = await insertHold({ email: 'crash@example.test' });
    const second = await insertHold({ email: 'stuck@example.test' });
    const fixedNow = new Date();
    await prisma.$transaction((tx) =>
      writer.writeInTransaction(tx, {
        bookingId: first.id,
        email: 'crash@example.test',
        token: 'a'.repeat(64),
        eventType: 'guest.recovery.invite',
        expiresAt: first.holdExpiresAt,
      }),
    );
    await prisma.$transaction((tx) =>
      writer.writeInTransaction(tx, {
        bookingId: second.id,
        email: 'stuck@example.test',
        token: 'b'.repeat(64),
        eventType: 'guest.recovery.invite',
        expiresAt: second.holdExpiresAt,
      }),
    );
    // Giả lập crash: bản ghi thứ hai kẹt ở SENDING từ 10 phút trước.
    const stuckRow = await prisma.outboxMessage.findFirstOrThrow({
      where: { aggregateId: second.id },
    });
    await prisma.outboxMessage.update({
      where: { id: stuckRow.id },
      data: { status: 'SENDING', attemptCount: 1, updatedAt: new Date(fixedNow.getTime() - 10 * 60_000) },
    });
    const result = await worker.runOnce(new Date(fixedNow.getTime() + 1000));
    expect(result.sent).toBe(2);
    expect(mail.memoryOutbox.map((item) => item.to).sort()).toEqual([
      'crash@example.test',
      'stuck@example.test',
    ]);
    for (const item of mail.memoryOutbox) {
      expect(item.token).toHaveLength(64);
    }
    // F6: bản ghi SENT giữ ciphertext tới retention sweep, chưa purge ngay.
    const stored = await prisma.outboxMessage.findFirstOrThrow({
      where: { aggregateId: first.id },
    });
    expect(stored.status).toBe('SENT');
    expect(stored.purgedAt).toBeNull();
    expect(stored.payloadCiphertext.length).toBeGreaterThan(0);
  });

  it('AC-21 (Bỏ qua thư cho đơn đã hết hạn: EXPIRED_SKIPPED, 0 thư)', async () => {
    const mail = new GuestRecoveryMailService(testConfig());
    const worker = new GuestRecoveryMailWorker(prisma, crypto, mail);
    const hold = await insertHold({ email: 'late@example.test', holdMinutesFromNow: -1 });
    await prisma.$transaction((tx) =>
      writer.writeInTransaction(tx, {
        bookingId: hold.id,
        email: 'late@example.test',
        token: 'c'.repeat(64),
        eventType: 'guest.recovery.invite',
        expiresAt: hold.holdExpiresAt,
      }),
    );
    const result = await worker.runOnce(new Date());
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mail.memoryOutbox).toHaveLength(0);
    const row = await prisma.outboxMessage.findFirstOrThrow({
      where: { aggregateId: hold.id },
    });
    expect(row.status).toBe('EXPIRED_SKIPPED');
    // F6: giữ ciphertext tới retention sweep (expiresAt + 24 giờ), không purge ngay.
    expect(row.payloadCiphertext.length).toBeGreaterThan(0);
    expect(row.purgedAt).toBeNull();
  });

  it('retention sweep xóa ciphertext bản ghi cuối cũ hơn 24 giờ', async () => {
    const mail = new GuestRecoveryMailService(testConfig());
    const worker = new GuestRecoveryMailWorker(prisma, crypto, mail);
    const hold = await insertHold({ email: 'old@example.test', holdMinutesFromNow: -(60 * 26 + 10) });
    await prisma.$transaction((tx) =>
      writer.writeInTransaction(tx, {
        bookingId: hold.id,
        email: 'old@example.test',
        token: 'f'.repeat(64),
        eventType: 'guest.recovery.invite',
        expiresAt: hold.holdExpiresAt,
      }),
    );
    const result = await worker.runOnce(new Date());
    expect(result.skipped).toBe(1);
    expect(result.purged).toBe(1);
    const row = await prisma.outboxMessage.findFirstOrThrow({
      where: { aggregateId: hold.id },
    });
    expect(row.status).toBe('EXPIRED_SKIPPED');
    expect(row.payloadCiphertext).toHaveLength(0);
    expect(row.purgedAt).not.toBeNull();
  });

  it('hai worker DB thật không gửi trùng thư', async () => {
    const sent: string[] = [];
    const slowMail = new GuestRecoveryMailService(testConfig());
    const originalSend = slowMail.sendRecoveryMail.bind(slowMail);
    slowMail.sendRecoveryMail = async (content) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      sent.push(content.bookingId);
      return originalSend(content);
    };
    const first = new GuestRecoveryMailWorker(prisma, crypto, slowMail);
    const second = new GuestRecoveryMailWorker(prisma, crypto, slowMail);
    const ids: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const hold = await insertHold({ email: `race${index}@example.test` });
      ids.push(hold.id);
      await prisma.$transaction((tx) =>
        writer.writeInTransaction(tx, {
          bookingId: hold.id,
          email: `race${index}@example.test`,
          token: 'g'.repeat(64),
          eventType: 'guest.recovery.invite',
          expiresAt: hold.holdExpiresAt,
        }),
      );
    }
    const [left, right] = await Promise.all([first.runOnce(), second.runOnce()]);
    expect(left.sent + right.sent).toBe(3);
    expect([...sent].sort()).toEqual([...ids].sort());
  });

  it('P5-01 (Ciphertext bị sửa thì FAILED vĩnh viễn, không gửi)', async () => {
    const mail = new GuestRecoveryMailService(testConfig());
    const worker = new GuestRecoveryMailWorker(prisma, crypto, mail);
    const hold = await insertHold({ email: 'tamper@example.test' });
    await prisma.$transaction((tx) =>
      writer.writeInTransaction(tx, {
        bookingId: hold.id,
        email: 'tamper@example.test',
        token: 'd'.repeat(64),
        eventType: 'guest.recovery.invite',
        expiresAt: hold.holdExpiresAt,
      }),
    );
    const row = await prisma.outboxMessage.findFirstOrThrow({
      where: { aggregateId: hold.id },
    });
    const tampered = Buffer.from(row.payloadCiphertext);
    tampered[0] ^= 0x01;
    await prisma.outboxMessage.update({
      where: { id: row.id },
      data: { payloadCiphertext: tampered },
    });
    const result = await worker.runOnce(new Date());
    expect(result.failed).toBe(1);
    expect(mail.memoryOutbox).toHaveLength(0);
    const stored = await prisma.outboxMessage.findFirstOrThrow({
      where: { aggregateId: hold.id },
    });
    expect(stored.status).toBe('FAILED');
    // S5-05: job kết thúc cuối xóa nextRetryAt để không bị claim lại.
    expect(stored.nextRetryAt).toBeNull();
    const again = await worker.runOnce(new Date());
    expect(again.claimed).toBe(0);
  });

  it('thiếu khóa mã hóa thì đặt sân vẫn tạo outbox? Không — writer bỏ qua, booking vẫn tồn tại (Q3)', async () => {
    const unconfigured = new GuestRecoveryOutboxWriter(
      new GuestRecoveryOutboxCrypto(
        new ConfigService({} as Record<string, string>),
      ),
    );
    const hold = await insertHold({});
    const outcome = await prisma.$transaction((tx) =>
      unconfigured.writeInTransaction(tx, {
        bookingId: hold.id,
        email: 'guest@example.test',
        token: 'e'.repeat(64),
        eventType: 'guest.recovery.invite',
        expiresAt: hold.holdExpiresAt,
      }),
    );
    expect(outcome).toBe('SKIPPED_UNCONFIGURED');
    const rows = await prisma.outboxMessage.findMany({
      where: { aggregateId: hold.id },
    });
    expect(rows).toHaveLength(0);
    expect(await prisma.booking.findUnique({ where: { id: hold.id } })).not.toBeNull();
  });
});
