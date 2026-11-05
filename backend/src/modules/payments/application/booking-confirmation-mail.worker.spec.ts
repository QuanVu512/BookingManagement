import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { BookingConfirmationMailService } from '../infrastructure/booking-confirmation-mail.service.js';
import {
  BookingConfirmationMailWorker,
  bookingConfirmationDedupKey,
} from './booking-confirmation-mail.worker.js';

interface FakeOutboxEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  publishedAt: Date | null;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  occurredAt: Date;
}

interface FakeDelivery {
  bookingId: string;
  recipientEmail: string;
  templateCode: string;
  deduplicationKey: string;
  status: string;
  attemptCount: number;
  nextRetryAt: Date | null;
  lastError: string | null;
  sentAt: Date | null;
}

interface FakeBooking {
  id: string;
  bookingCode: string;
  status: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  startsAt: Date;
  endsAt: Date;
  totalAmount: number;
  requiredPrepaymentAmount: number;
  userId: string | null;
  court: { name: string };
  customer: { email: string; profile: { fullName: string } | null } | null;
}

class FakePrisma {
  events = new Map<string, FakeOutboxEvent>();
  deliveries = new Map<string, FakeDelivery>();
  bookings = new Map<string, FakeBooking>();
  failDeliveryCreateOnce = false;
  deliveryCreateCalls = 0;

  outboxEvent = {
    findMany: jest.fn(
      async (args: {
        where: { eventType: string };
        take: number;
      }): Promise<Array<{ id: string }>> => {
        const now = new Date();
        return [...this.events.values()]
          .filter(
            (row) =>
              row.eventType === args.where.eventType &&
              row.publishedAt === null &&
              (row.nextRetryAt === null || row.nextRetryAt <= now),
          )
          .slice(0, args.take)
          .map((row) => ({ id: row.id }));
      },
    ),
    findUnique: jest.fn(
      async (args: {
        where: { id: string };
      }): Promise<FakeOutboxEvent | null> =>
        this.events.get(args.where.id) ?? null,
    ),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const row = this.events.get(args.where.id);
        if (!row) throw new Error('RecordNotFound');
        const data = args.data;
        if ('publishedAt' in data) row.publishedAt = data.publishedAt as Date;
        if ('attemptCount' in data)
          row.attemptCount = data.attemptCount as number;
        if ('nextRetryAt' in data)
          row.nextRetryAt = data.nextRetryAt as Date | null;
        if ('lastError' in data) row.lastError = data.lastError as string;
        return row;
      },
    ),
  };

  notificationDelivery = {
    findUnique: jest.fn(
      async (args: {
        where: { deduplicationKey: string };
      }): Promise<FakeDelivery | null> =>
        this.deliveries.get(args.where.deduplicationKey) ?? null,
    ),
    create: jest.fn(async (args: { data: FakeDelivery }) => {
      this.deliveryCreateCalls += 1;
      if (this.failDeliveryCreateOnce) {
        this.failDeliveryCreateOnce = false;
        const error = new Error('Unique constraint') as Error & {
          code: string;
        };
        error.code = 'P2002';
        throw error;
      }
      if (this.deliveries.has(args.data.deduplicationKey)) {
        const error = new Error('Unique constraint') as Error & {
          code: string;
        };
        error.code = 'P2002';
        throw error;
      }
      this.deliveries.set(args.data.deduplicationKey, {
        ...args.data,
        sentAt: null,
        lastError: null,
        nextRetryAt: null,
      });
      return { id: 'delivery-1' };
    }),
    updateMany: jest.fn(
      async (args: {
        where: { deduplicationKey: string };
        data: Record<string, unknown>;
      }): Promise<{ count: number }> => {
        const row = this.deliveries.get(args.where.deduplicationKey);
        if (!row) return { count: 0 };
        const data = args.data;
        if (data.status) row.status = data.status as string;
        if (
          data.attemptCount &&
          typeof data.attemptCount === 'object' &&
          'increment' in (data.attemptCount as Record<string, unknown>)
        ) {
          row.attemptCount += 1;
        }
        if ('nextRetryAt' in data)
          row.nextRetryAt = data.nextRetryAt as Date | null;
        if ('lastError' in data)
          row.lastError = data.lastError as string | null;
        if ('sentAt' in data) row.sentAt = data.sentAt as Date;
        return { count: 1 };
      },
    ),
  };

  booking = {
    findUnique: jest.fn(
      async (): Promise<FakeBooking | null> =>
        [...this.bookings.values()][0] ?? null,
    ),
  };
}

class MemoryMail extends BookingConfirmationMailService {
  readonly delivered: Array<{
    to: string;
    bookingCode: string;
    isMember: boolean;
  }> = [];
  failuresLeft = 0;

  override async sendConfirmationMail(
    content: Parameters<
      BookingConfirmationMailService['sendConfirmationMail']
    >[0],
  ): Promise<void> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('SMTP_DELIVERY_FAILED');
    }
    this.delivered.push({
      to: content.to,
      bookingCode: content.bookingCode,
      isMember: content.isMember,
    });
  }
}

function testConfig() {
  return new ConfigService({
    BOOKING_CONFIRMATION_MAIL_MEMORY: 'true',
  } as Record<string, string>);
}

function seedConfirmedGuest(prisma: FakePrisma, bookingId = 'bk-1') {
  prisma.events.set('ev-1', {
    id: 'ev-1',
    eventType: 'booking.confirmed',
    aggregateId: bookingId,
    publishedAt: null,
    attemptCount: 0,
    nextRetryAt: null,
    lastError: null,
    occurredAt: new Date(),
  });
  prisma.bookings.set(bookingId, {
    id: bookingId,
    bookingCode: 'BK-100',
    status: 'CONFIRMED',
    customerName: 'Khách vãng lai',
    customerEmail: 'guest@example.com',
    customerPhone: '0900000001',
    startsAt: new Date('2035-01-08T01:00:00Z'),
    endsAt: new Date('2035-01-08T02:00:00Z'),
    totalAmount: 300_000,
    requiredPrepaymentAmount: 90_000,
    userId: null,
    court: { name: 'Sân 1' },
    customer: null,
  });
}

describe('BookingConfirmationMailWorker (gửi thư xác nhận nền)', () => {
  function setup() {
    const prisma = new FakePrisma();
    const mail = new MemoryMail(testConfig());
    const worker = new BookingConfirmationMailWorker(prisma as never, mail);
    return { prisma, mail, worker };
  }

  it('confirm thành công thì gửi đúng một email cho khách vãng lai', async () => {
    const { prisma, mail, worker } = setup();
    seedConfirmedGuest(prisma);
    const result = await worker.runOnce();
    expect(result).toEqual({
      claimed: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      retried: 0,
    });
    expect(mail.delivered).toEqual([
      { to: 'guest@example.com', bookingCode: 'BK-100', isMember: false },
    ]);
    expect(prisma.events.get('ev-1')!.publishedAt).not.toBeNull();
  });

  it('gửi cho thành viên bằng email hồ sơ thay vì snapshot rỗng', async () => {
    const { prisma, mail, worker } = setup();
    seedConfirmedGuest(prisma);
    prisma.bookings.set('bk-1', {
      ...prisma.bookings.get('bk-1')!,
      userId: 'user-1',
      customer: {
        email: 'member@example.com',
        profile: { fullName: 'Thành viên' },
      },
    });
    await worker.runOnce();
    expect(mail.delivered[0].to).toBe('member@example.com');
    expect(mail.delivered[0].isMember).toBe(true);
  });

  it('không gửi trùng khi confirm lại (CAS ALREADY_CONFIRMED dùng cùng outbox)', async () => {
    const { prisma, mail, worker } = setup();
    seedConfirmedGuest(prisma);
    await worker.runOnce();
    // Webhook gọi lại: không có outbox mới, worker chạy lại không gửi thêm.
    prisma.events.get('ev-1')!.publishedAt = new Date();
    const second = await worker.runOnce();
    expect(second.sent).toBe(0);
    expect(mail.delivered).toHaveLength(1);
    // Kể cả khi event cũ bị mở lại, delivery SENT chặn gửi trùng.
    const replay = prisma.events.get('ev-1')!;
    replay.publishedAt = null;
    const third = await worker.runOnce();
    expect(third.sent).toBe(0);
    expect(mail.delivered).toHaveLength(1);
  });

  it('thua race tạo delivery (P2002) thì bỏ qua, không gửi trùng', async () => {
    const { prisma, mail, worker } = setup();
    seedConfirmedGuest(prisma);
    prisma.failDeliveryCreateOnce = true;
    const result = await worker.runOnce();
    expect(result.sent).toBe(0);
    expect(mail.delivered).toHaveLength(0);
    // Dedup key đã thuộc về worker thắng nên lần sau coi như đã gửi.
    prisma.deliveries.set(bookingConfirmationDedupKey('bk-1'), {
      bookingId: 'bk-1',
      recipientEmail: 'guest@example.com',
      templateCode: 'BOOKING_CONFIRMED',
      deduplicationKey: bookingConfirmationDedupKey('bk-1'),
      status: 'SENT',
      attemptCount: 1,
      nextRetryAt: null,
      lastError: null,
      sentAt: new Date(),
    });
    prisma.events.get('ev-1')!.publishedAt = null;
    await worker.runOnce();
    expect(mail.delivered).toHaveLength(0);
  });

  it('SMTP lỗi thì hẹn gửi lại, giữ nguyên CONFIRMED và không mất thư', async () => {
    const { prisma, mail, worker } = setup();
    seedConfirmedGuest(prisma);
    mail.failuresLeft = 1;
    const first = await worker.runOnce();
    expect(first.retried).toBe(1);
    expect(mail.delivered).toHaveLength(0);
    expect(prisma.events.get('ev-1')!.publishedAt).toBeNull();
    expect(prisma.events.get('ev-1')!.nextRetryAt).not.toBeNull();
    // Trạng thái booking giữ nguyên CONFIRMED — worker không rollback.
    expect(prisma.bookings.get('bk-1')!.status).toBe('CONFIRMED');
    mail.failuresLeft = 0;
    prisma.events.get('ev-1')!.nextRetryAt = new Date(Date.now() - 1000);
    const second = await worker.runOnce();
    expect(second.sent).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  });
});
