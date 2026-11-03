import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { GuestRecoveryOutboxCrypto } from '../infrastructure/guest-recovery-outbox-crypto.js';
import { GuestRecoveryMailService } from '../infrastructure/guest-recovery-mail.service.js';
import { GuestRecoveryMailWorker } from './guest-recovery-mail.worker.js';

const V1 = 'v1:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

interface FakeRow {
  id: string;
  aggregateId: string;
  eventType: string;
  payloadCiphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: string;
  status: string;
  attemptCount: number;
  nextRetryAt: Date | null;
  expiresAt: Date;
  sentAt: Date | null;
  lastError: string | null;
  purgedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface FakeBooking {
  id: string;
  userId: string | null;
  status: string;
  holdExpiresAt: Date;
  bookingCode: string;
  customerEmail: string;
  startsAt: Date;
  endsAt: Date;
  requiredPrepaymentAmount: number;
  court: { name: string };
}

function future(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

function past(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

class FakePrisma {
  rows = new Map<string, FakeRow>();
  bookings = new Map<string, FakeBooking>();
  /** Giờ DB giả lập; mail hook trong test có thể đẩy tiến để mô phỏng trôi giờ. */
  fakeNow = new Date();

  async $transaction<T>(fn: (tx: never) => Promise<T>): Promise<T> {
    // Mô phỏng khóa hàng của SELECT ... FOR UPDATE SKIP LOCKED: toàn bộ
    // claim (chọn + đổi trạng thái) của hai worker không xen vào nhau.
    return this.withTxLock(() => fn(this as never));
  }

  private txQueue: Promise<void> = Promise.resolve();

  private async withTxLock<T>(fn: () => Promise<T>): Promise<T> {
    const turn = this.txQueue.then(fn, fn);
    this.txQueue = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }

  async $queryRaw(query: unknown): Promise<unknown> {
    const text =
      typeof query === 'string'
        ? query
        : Array.isArray((query as { strings?: unknown }).strings)
          ? (query as { strings: string[] }).strings.join(' ')
          : String(query);
    if (text.includes('clock_timestamp')) return [{ now: new Date(this.fakeNow) }];
    const now = new Date(this.fakeNow);
    const stuckBefore = now.getTime() - 2 * 60_000;
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.purgedAt === null &&
          ((row.status === 'QUEUED' &&
            (row.nextRetryAt === null || row.nextRetryAt <= now)) ||
            (row.status === 'FAILED' &&
              row.nextRetryAt !== null &&
              row.nextRetryAt <= now) ||
            (row.status === 'SENDING' && row.updatedAt.getTime() < stuckBefore)),
      )
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, 5)
      .map((row) => ({ id: row.id }));
  }

  outboxMessage = {
    updateMany: jest.fn(async (args: {
      where: {
        id?: { in: string[] } | string;
        status?: { in: string[] };
        purgedAt?: null;
        attemptCount?: number;
      };
      data: Record<string, unknown>;
    }): Promise<{ count: number }> => {
      let count = 0;
      for (const row of this.rows.values()) {
        if (args.where.id) {
          const ids =
            typeof args.where.id === 'string'
              ? [args.where.id]
              : args.where.id.in;
          if (!ids.includes(row.id)) continue;
        }
        if (args.where.status) {
          const allowed =
            typeof args.where.status === 'string'
              ? [args.where.status]
              : args.where.status.in;
          if (!allowed.includes(row.status)) continue;
        }
        if ('purgedAt' in args.where && row.purgedAt !== null) continue;
        if (
          args.where.attemptCount !== undefined &&
          row.attemptCount !== args.where.attemptCount
        )
          continue;
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
        if ('lastError' in data) row.lastError = data.lastError as string | null;
        if ('sentAt' in data) row.sentAt = data.sentAt as Date;
        if ('purgedAt' in data) row.purgedAt = data.purgedAt as Date;
        if ('payloadCiphertext' in data) {
          row.payloadCiphertext = Buffer.from(data.payloadCiphertext as Uint8Array);
          row.iv = Buffer.from(data.iv as Uint8Array);
          row.authTag = Buffer.from(data.authTag as Uint8Array);
        }
        if ('updatedAt' in data) {
          row.updatedAt = data.updatedAt as Date;
        } else {
          row.updatedAt = new Date(this.fakeNow);
        }
        count += 1;
      }
      return { count };
    }),
    findMany: jest.fn(async (args: {
      where: Record<string, unknown>;
      select?: Record<string, boolean>;
      take?: number;
    }): Promise<Array<Partial<FakeRow>>> => {
      let list = [...this.rows.values()];
      const where = args.where as {
        id?: { in: string[] };
        status?: string | { in: string[] };
        purgedAt?: null;
        expiresAt?: { lt: Date };
      };
      if (where.id) list = list.filter((row) => where.id!.in.includes(row.id));
      if (where.status) {
        list =
          typeof where.status === 'string'
            ? list.filter((row) => row.status === where.status)
            : list.filter((row) =>
                (where.status as { in: string[] }).in.includes(row.status),
              );
      }
      if ('purgedAt' in where)
        list = list.filter((row) => row.purgedAt === null);
      if (where.expiresAt)
        list = list.filter((row) => row.expiresAt < where.expiresAt!.lt);
      if (args.take) list = list.slice(0, args.take);
      return list;
    }),
    findUnique: jest.fn(async (args: {
      where: { id: string };
    }): Promise<FakeRow | null> => this.rows.get(args.where.id) ?? null),
    update: jest.fn(async (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<FakeRow> => {
      const row = this.rows.get(args.where.id);
      if (!row) throw new Error('RecordNotFound');
      const data = args.data;
      if (data.status) row.status = data.status as string;
      if ('nextRetryAt' in data) row.nextRetryAt = data.nextRetryAt as Date | null;
      if ('lastError' in data) row.lastError = data.lastError as string | null;
      if ('sentAt' in data) row.sentAt = data.sentAt as Date;
      if ('purgedAt' in data) row.purgedAt = data.purgedAt as Date;
      if ('payloadCiphertext' in data) {
        row.payloadCiphertext = Buffer.from(data.payloadCiphertext as Uint8Array);
        row.iv = Buffer.from(data.iv as Uint8Array);
        row.authTag = Buffer.from(data.authTag as Uint8Array);
      }
      row.updatedAt = new Date(this.fakeNow);
      return row;
    }),
  };

  booking = {
    findUnique: jest.fn(
      async (args?: { where?: { id?: string } }): Promise<FakeBooking | null> => {
        if (args?.where?.id) return this.bookings.get(args.where.id) ?? null;
        return [...this.bookings.values()][0] ?? null;
      },
    ),
  };
}

class MemoryMail extends GuestRecoveryMailService {
  readonly delivered: Array<Parameters<GuestRecoveryMailService['sendRecoveryMail']>[0]> = [];
  failuresLeft = 0;
  onSend: (() => void) | null = null;

  override async sendRecoveryMail(
    content: Parameters<GuestRecoveryMailService['sendRecoveryMail']>[0],
  ): Promise<void> {
    this.onSend?.();
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('SMTP_DELIVERY_FAILED');
    }
    this.delivered.push(content);
  }
}

function testConfig() {
  return new ConfigService({
    GUEST_RECOVERY_OUTBOX_KEYS: V1,
    GUEST_RECOVERY_ACTIVE_KEY_VERSION: 'v1',
    GUEST_RECOVERY_MAIL_MEMORY: 'true',
    WEB_ORIGIN: 'http://localhost:4001',
  } as Record<string, string>);
}

describe('GuestRecoveryMailWorker (gửi thư phục hồi chạy nền)', () => {
  function setup() {
    const prisma = new FakePrisma();
    const crypto = new GuestRecoveryOutboxCrypto(testConfig());
    const mail = new MemoryMail(testConfig());
    const worker = new GuestRecoveryMailWorker(
      prisma as never,
      crypto,
      mail,
    );
    return { prisma, crypto, mail, worker };
  }

  function seedHold(
    prisma: FakePrisma,
    crypto: GuestRecoveryOutboxCrypto,
    overrides: Partial<FakeRow & { token: string }> = {},
  ) {
    const bookingId = (overrides.aggregateId as string | undefined) ?? 'bk-1';
    const token = 't'.repeat(64);
    const encrypted = crypto.encrypt(
      JSON.stringify({ v: 1, bookingId, email: 'a@example.com', token, eventType: 'guest.recovery.invite' }),
      { bookingId, eventType: 'guest.recovery.invite' },
    );
    const row: FakeRow = {
      id: 'out-1',
      aggregateId: bookingId,
      eventType: 'guest.recovery.invite',
      payloadCiphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyVersion: encrypted.keyVersion,
      status: 'QUEUED',
      attemptCount: 0,
      nextRetryAt: null,
      expiresAt: future(5),
      sentAt: null,
      lastError: null,
      purgedAt: null,
      createdAt: past(1),
      updatedAt: past(1),
      ...overrides,
    };
    prisma.rows.set(row.id, row);
    prisma.bookings.set('bk-1', {
      id: 'bk-1',
      userId: null,
      status: 'HOLDING',
      holdExpiresAt: future(5),
      bookingCode: 'BK-1',
      customerEmail: 'a@example.com',
      startsAt: future(60),
      endsAt: future(120),
      requiredPrepaymentAmount: 90000,
      court: { name: 'Sân 1' },
    });
    return { row, token };
  }

  it('gửi thư cho đơn còn hạn, đánh dấu SENT và giữ ciphertext tới retention (AC-20)', async () => {
    const { prisma, crypto, mail, worker } = setup();
    seedHold(prisma, crypto);
    const result = await worker.runOnce();
    expect(result).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0, retried: 0, purged: 0 });
    expect(mail.delivered).toHaveLength(1);
    expect(mail.delivered[0].to).toBe('a@example.com');
    expect(mail.delivered[0].token).toHaveLength(64);
    const stored = prisma.rows.get('out-1')!;
    expect(stored.status).toBe('SENT');
    expect(stored.sentAt).not.toBeNull();
    expect(stored.nextRetryAt).toBeNull();
    // F6 canonical: ciphertext giữ tới retention sweep, không purge ngay.
    expect(stored.payloadCiphertext.length).toBeGreaterThan(0);
    expect(stored.purgedAt).toBeNull();
  });

  it('bỏ qua thư khi đơn đã hết hạn giữ chỗ (AC-21 EXPIRED_SKIPPED)', async () => {
    const { prisma, crypto, mail, worker } = setup();
    seedHold(prisma, crypto);
    prisma.bookings.set('bk-1', {
      ...([...prisma.bookings.values()][0] as FakeBooking),
      status: 'HOLDING',
      holdExpiresAt: past(1),
    });
    const result = await worker.runOnce();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mail.delivered).toHaveLength(0);
    expect(prisma.rows.get('out-1')!.status).toBe('EXPIRED_SKIPPED');
  });

  it('S5-02 (Kiểm hạn bằng giờ DB ngay trước gửi): thư thứ hai sau hạn bị bỏ', async () => {
    const { prisma, crypto, mail, worker } = setup();
    seedHold(prisma, crypto);
    // Đơn thứ hai hết hạn sau 5 giây; lần gửi đầu làm đồng hồ trôi 10 giây.
    prisma.bookings.set('bk-2', {
      ...(prisma.bookings.get('bk-1') as FakeBooking),
      id: 'bk-2',
      holdExpiresAt: new Date(prisma.fakeNow.getTime() + 5000),
    });
    seedHold(prisma, crypto, { id: 'out-2', aggregateId: 'bk-2' });
    // Xử lý out-1 trước để lần gửi đầu làm trôi đồng hồ giả.
    prisma.rows.get('out-2')!.createdAt = new Date();
    mail.onSend = () => {
      prisma.fakeNow = new Date(prisma.fakeNow.getTime() + 10000);
    };
    const result = await worker.runOnce();
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mail.delivered.map((item) => item.bookingId).sort()).toEqual(['bk-1']);
  });

  it('gửi lại bản ghi SENDING kẹt quá 2 phút sau crash (AC-20)', async () => {
    const { prisma, crypto, mail, worker } = setup();
    seedHold(prisma, crypto, {
      status: 'SENDING',
      attemptCount: 1,
      updatedAt: past(10),
    });
    const result = await worker.runOnce();
    expect(result.sent).toBe(1);
    expect(mail.delivered).toHaveLength(1);
  });

  it('SMTP lỗi thì hẹn lại, quá 5 lần thì FAILED cuối và không bị claim lại (S5-05)', async () => {
    const { prisma, crypto, mail, worker } = setup();
    mail.failuresLeft = 99;
    seedHold(prisma, crypto);
    for (let round = 0; round < 4; round += 1) {
      const row = prisma.rows.get('out-1')!;
      expect(row.status).toBe(round === 0 ? 'QUEUED' : 'FAILED');
      row.nextRetryAt = new Date(Date.now() - 1000);
      const result = await worker.runOnce();
      expect(result.retried + result.failed).toBe(1);
    }
    const row = prisma.rows.get('out-1')!;
    row.nextRetryAt = new Date(Date.now() - 1000);
    await worker.runOnce();
    expect(row.status).toBe('FAILED');
    expect(row.nextRetryAt).toBeNull();
    expect(mail.delivered).toHaveLength(0);
    // Tombstone/final không bao giờ bị claim lại.
    const again = await worker.runOnce();
    expect(again.claimed).toBe(0);
  });

  it('ciphertext bị sửa thì FAILED vĩnh viễn, không gửi thư (P5-01)', async () => {
    const { prisma, crypto, mail, worker } = setup();
    const { row } = seedHold(prisma, crypto);
    row.payloadCiphertext = Buffer.from(row.payloadCiphertext);
    row.payloadCiphertext[0] ^= 0x01;
    const result = await worker.runOnce();
    expect(result.failed).toBe(1);
    expect(mail.delivered).toHaveLength(0);
    expect(prisma.rows.get('out-1')!.status).toBe('FAILED');
  });

  it('retention sweep xóa ciphertext bản ghi cuối cũ hơn 24 giờ', async () => {
    const { prisma, crypto, mail, worker } = setup();
    seedHold(prisma, crypto, {
      status: 'SENT',
      sentAt: past(60 * 26),
      expiresAt: past(60 * 25),
    });
    const result = await worker.runOnce();
    expect(result.purged).toBe(1);
    const stored = prisma.rows.get('out-1')!;
    expect(stored.payloadCiphertext).toHaveLength(0);
    expect(stored.purgedAt).not.toBeNull();
    expect(stored.status).toBe('SENT');
    expect(mail.delivered).toHaveLength(0);
  });

  it('lastError không bao giờ chứa token (P5-08 chống lộ bí mật)', async () => {
    const { prisma, crypto, mail, worker } = setup();
    mail.failuresLeft = 99;
    const { token } = seedHold(prisma, crypto);
    await worker.runOnce();
    const row = prisma.rows.get('out-1')!;
    expect(row.lastError ?? '').not.toContain(token);
    expect(row.lastError ?? '').not.toContain('a@example.com');
  });

  it('hai worker chạy song song không gửi trùng thư (S5-03 lease theo batch)', async () => {
    const { prisma, crypto, mail, worker } = setup();
    const other = new GuestRecoveryMailWorker(
      prisma as never,
      crypto,
      mail,
    );
    // 8 thư > batch claim 5: worker đầu lấy 5, worker sau lấy 3 còn lại.
    for (let index = 0; index < 8; index += 1) {
      const id = `out-c-${index}`;
      const bookingId = `bk-c-${index}`;
      const encrypted = crypto.encrypt(
        JSON.stringify({ v: 1, bookingId, email: `c${index}@example.com`, token: 't'.repeat(64), eventType: 'guest.recovery.invite' }),
        { bookingId, eventType: 'guest.recovery.invite' },
      );
      prisma.rows.set(id, {
        id,
        aggregateId: bookingId,
        eventType: 'guest.recovery.invite',
        payloadCiphertext: encrypted.ciphertext,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
        keyVersion: encrypted.keyVersion,
        status: 'QUEUED',
        attemptCount: 0,
        nextRetryAt: null,
        expiresAt: future(5),
        sentAt: null,
        lastError: null,
        purgedAt: null,
        createdAt: new Date(),
        updatedAt: past(1),
      });
      prisma.bookings.set(bookingId, {
        id: bookingId,
        userId: null,
        status: 'HOLDING',
        holdExpiresAt: future(5),
        bookingCode: `BK-C-${index}`,
        customerEmail: `c${index}@example.com`,
        startsAt: future(60),
        endsAt: future(120),
        requiredPrepaymentAmount: 90000,
        court: { name: 'Sân 1' },
      });
    }
    const [first, second] = await Promise.all([
      worker.runOnce(),
      other.runOnce(),
    ]);
    expect(first.sent + second.sent).toBe(8);
    const recipients = mail.delivered.map((item) => item.to).sort();
    expect(recipients).toEqual([
      'c0@example.com',
      'c1@example.com',
      'c2@example.com',
      'c3@example.com',
      'c4@example.com',
      'c5@example.com',
      'c6@example.com',
      'c7@example.com',
    ]);
  });

  it('S5-03 (Mất lease không gửi): generation đổi giữa claim và gửi thì bỏ qua, không gửi', async () => {
    const { prisma, crypto, mail, worker } = setup();
    seedHold(prisma, crypto);
    // Mô phỏng worker khác reclaim giữa lúc worker này đọc booking: tăng
    // attemptCount như claim của worker khác, rồi mới cho đọc tiếp.
    let bookingReads = 0;
    const origFindUnique = prisma.booking.findUnique;
    (prisma.booking as { findUnique: unknown }).findUnique = jest.fn(
      async (args?: { where?: { id?: string } }) => {
        bookingReads += 1;
        if (bookingReads === 1) {
          const row = prisma.rows.get('out-1')!;
          row.attemptCount += 1;
          row.updatedAt = new Date();
        }
        return origFindUnique(args);
      },
    );
    const result = await worker.runOnce();
    expect(result.sent).toBe(0);
    expect(mail.delivered).toHaveLength(0);
    // Không finalize khi mất lease: giữ SENDING để worker đang giữ lease xử lý.
    const row = prisma.rows.get('out-1')!;
    expect(row.status).toBe('SENDING');
    expect(row.attemptCount).toBe(2);
  });
});
