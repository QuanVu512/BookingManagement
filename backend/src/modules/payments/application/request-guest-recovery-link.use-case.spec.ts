import { describe, expect, it, jest } from '@jest/globals';
import { RequestGuestRecoveryLinkUseCase } from './request-guest-recovery-link.use-case.js';
import { GUEST_LOOKUP_GENERIC_MESSAGE } from '../domain/guest-lookup-fanout-policy.js';
import { GuestRecoveryOutboxWriter } from './guest-recovery-outbox.writer.js';

function future(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

interface BookingRow {
  id: string;
  createdAt: Date;
  customerEmail: string;
  holdExpiresAt: Date;
}

function setup(options: {
  bookings?: BookingRow[];
  redisCounts?: Map<string, number>;
  redisDown?: boolean;
  tokenError?: Error | null;
} = {}) {
  const written: Array<{ bookingId: string; email: string; token: string }> = [];
  const issued: string[] = [];
  const prisma = {
    $queryRaw: jest.fn(async () => [{ now: new Date() }]),
    booking: {
      findMany: jest.fn(async () => options.bookings ?? []),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({}),
    ),
  };
  const tokens = {
    issueCheckoutToken: jest.fn(async (input: { bookingId: string }) => {
      if (options.tokenError) throw options.tokenError;
      issued.push(input.bookingId);
      return {
        rawToken: 't'.repeat(64),
        tokenId: 'tok-1',
        expiresAt: future(10),
      };
    }),
  };
  const outbox = {
    writeInTransaction: jest.fn(
      async (
        _tx: unknown,
        input: { bookingId: string; email: string; token: string },
      ) => {
        written.push({
          bookingId: input.bookingId,
          email: input.email,
          token: input.token,
        });
        return 'QUEUED' as const;
      },
    ),
  };
  const counts = options.redisCounts ?? new Map<string, number>();
  const redis = {
    client: {
      incr: jest.fn(async (key: string) => {
        if (options.redisDown) throw new Error('redis down');
        const next = (counts.get(key) ?? 0) + 1;
        counts.set(key, next);
        return next;
      }),
      expire: jest.fn(async () => true),
      del: jest.fn(async () => 1),
    },
  };
  const useCase = new RequestGuestRecoveryLinkUseCase(
    prisma as never,
    tokens as never,
    outbox as unknown as GuestRecoveryOutboxWriter,
    redis as never,
  );
  return { useCase, written, issued, prisma, counts };
}

describe('RequestGuestRecoveryLinkUseCase (tra cứu chống dò AC-22)', () => {
  it('trả đúng thông báo chung và ghi thư cho từng đơn còn hạn (email)', async () => {
    const { useCase, written, issued } = setup({
      bookings: [{ id: 'bk-1', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) }],
    });
    const result = await useCase.execute('a@example.com', '127.0.0.1');
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    expect(issued).toEqual(['bk-1']);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ bookingId: 'bk-1', email: 'a@example.com' });
  });

  it('email không tồn tại vẫn trả cùng nội dung, không ghi gì (P5-05)', async () => {
    const first = setup({
      bookings: [{ id: 'bk-1', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) }],
    });
    const second = setup({ bookings: [] });
    const [found, missing] = await Promise.all([
      first.useCase.execute('a@example.com'),
      second.useCase.execute('unknown@example.com'),
    ]);
    expect(found).toEqual(missing);
    expect(second.written).toHaveLength(0);
  });

  it('tra cứu bằng SĐT gửi link tới email của chủ đơn', async () => {
    const { useCase, written } = setup({
      bookings: [{ id: 'bk-2', createdAt: future(-2), customerEmail: 'owner@example.com', holdExpiresAt: future(3) }],
    });
    const result = await useCase.execute('0912345678');
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    expect(written).toHaveLength(1);
    expect(written[0].email).toBe('owner@example.com');
  });

  it('đơn đã hết hạn không được cấp token nhưng vẫn trả thông báo chung', async () => {
    const { useCase, written, issued } = setup({
      bookings: [{ id: 'bk-3', createdAt: future(-20), customerEmail: 'a@example.com', holdExpiresAt: future(-15) }],
    });
    const result = await useCase.execute('a@example.com');
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    expect(issued).toHaveLength(0);
    expect(written).toHaveLength(0);
  });

  it('vượt 3 thư/15 phút cho một email thì bỏ qua thư thứ 4 (S5-04, tính theo từng thư)', async () => {
    const counts = new Map<string, number>();
    const first = setup({
      bookings: [
        { id: 'bk-1', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
        { id: 'bk-2', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
        { id: 'bk-3', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
        { id: 'bk-4', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
      ],
      redisCounts: counts,
    });
    const result = await first.useCase.execute('a@example.com');
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    // 4 đơn nhưng chỉ 3 thư được ghi; đơn thứ 4 vượt quota recipient.
    expect(first.written.map((item) => item.bookingId).sort()).toEqual([
      'bk-1',
      'bk-2',
      'bk-3',
    ]);
  });

  it('S5-06 (Vượt quota IP vẫn trả 202 generic, không ghi outbox)', async () => {
    const counts = new Map<string, number>();
    const mk = (index: number) =>
      setup({
        bookings: [
          {
            id: `bk-ip-${index}`,
            createdAt: future(-2),
            customerEmail: `u${index}@example.com`,
            holdExpiresAt: future(3),
          },
        ],
        redisCounts: counts,
      });
    // 3 lượt đầu cùng IP, email khác nhau (không vướng quota recipient).
    for (let index = 0; index < 3; index += 1) {
      const attempt = mk(index);
      const result = await attempt.useCase.execute(`u${index}@example.com`, '10.0.0.9');
      expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
      expect(attempt.written).toHaveLength(1);
    }
    // Lượt thứ 4 cùng IP: vượt quota nhưng vẫn 202 generic, không ghi outbox.
    const over = mk(3);
    const result = await over.useCase.execute('u3@example.com', '10.0.0.9');
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    expect(over.written).toHaveLength(0);
  });

  it('S5-04 (Redis lỗi): fallback bộ nhớ trong tiến trình vẫn chặn thư thứ 4', async () => {
    const counts = new Map<string, number>();
    const first = setup({
      bookings: [
        { id: 'bk-1', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
        { id: 'bk-2', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
        { id: 'bk-3', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
        { id: 'bk-4', createdAt: future(-2), customerEmail: 'a@example.com', holdExpiresAt: future(3) },
      ],
      redisCounts: counts,
      redisDown: true,
    });
    const result = await first.useCase.execute('a@example.com');
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    expect(first.written.map((item) => item.bookingId).sort()).toEqual([
      'bk-1',
      'bk-2',
      'bk-3',
    ]);
  });

  it('token hết hạn thì bỏ qua đơn đó, không ném lỗi ra ngoài', async () => {
    const { useCase, written } = setup({
      bookings: [{ id: 'bk-1', createdAt: future(-20), customerEmail: 'a@example.com', holdExpiresAt: future(3) }],
      tokenError: Object.assign(new Error('expired'), { status: 401 }),
    });
    const result = await useCase.execute('a@example.com');
    expect(result).toEqual({ message: GUEST_LOOKUP_GENERIC_MESSAGE });
    expect(written).toHaveLength(0);
  });
});
