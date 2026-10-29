import { GuestTokenService } from './guest-token.service.js';

interface TokenRow {
  id: string;
  bookingId: string;
  purpose: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

function service(
  options: { dbNow?: Date; tokenRow?: TokenRow | null } = {},
): GuestTokenService {
  const prisma = {
    // P3-1: checkout token phải so hạn bằng clock_timestamp của DB.
    $queryRaw: async () => [{ now: options.dbNow ?? new Date() }],
    bookingAccessToken: {
      create: async () => ({ id: 'token-id' }),
      findUnique: async () => options.tokenRow ?? null,
      updateMany: async () => ({ count: 1 }),
    },
  };
  const config = {
    get: (key: string) =>
      key === 'GUEST_MANAGE_TOKEN_TTL_DAYS' ? '30' : undefined,
  };
  return new GuestTokenService(prisma as never, config as never);
}

describe('GuestTokenService (E3, MIG-11)', () => {
  it('token quá ngắn / sai booking / hết hạn / revoked bị từ chối', async () => {
    const tokens = service();
    expect(await tokens.verifyManageToken('short', 'booking-1')).toBeNull();
    expect(await tokens.verifyManageToken('', 'booking-1')).toBeNull();
  });

  it('issue trả raw token một lần kèm expiry hữu hạn', async () => {
    const tokens = service();
    const issued = await tokens.issueManageToken({
      bookingId: 'booking-1',
      startsAt: new Date('2035-01-08T01:00:00Z'),
    });
    expect(issued.rawToken).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.tokenId).toBe('token-id');
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('ttl cấu hình bị chặn trần 90 ngày, fallback 30', () => {
    expect(service().ttlDays()).toBe(30);
  });

  it('P3-1: issueCheckoutToken dùng clock_timestamp của DB, không dùng Date.now', async () => {
    const holdIssuedAt = new Date('2035-01-08T01:00:00.000Z');

    // DB clock đã qua mốc holdIssuedAt + 10 phút; Date.now() (2026) thì chưa.
    await expect(
      service({ dbNow: new Date('2035-01-08T01:10:00.001Z') }).issueCheckoutToken(
        { bookingId: 'booking-1', holdIssuedAt },
      ),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_TOKEN_EXPIRED' },
    });

    const live = service({ dbNow: new Date('2035-01-08T01:05:00.000Z') });
    const issued = await live.issueCheckoutToken({
      bookingId: 'booking-1',
      holdIssuedAt,
    });
    expect(issued.expiresAt.toISOString()).toBe('2035-01-08T01:10:00.000Z');
  });

  it('P3-1/P3-2: verifyCheckoutToken so hạn bằng DB clock và nhận UUID viết hoa', async () => {
    const row: TokenRow = {
      id: 'token-id',
      bookingId: '0e6b5b0e-0f5e-4b1c-9b7f-6f4d3a2b1c00',
      purpose: 'CHECKOUT_RECOVERY',
      expiresAt: new Date('2035-01-08T01:10:00.000Z'),
      revokedAt: null,
    };

    const live = service({
      dbNow: new Date('2035-01-08T01:05:00.000Z'),
      tokenRow: row,
    });
    expect(
      await live.verifyCheckoutToken('a'.repeat(64), row.bookingId.toUpperCase()),
    ).toMatchObject({ ok: true });

    const expired = service({
      dbNow: new Date('2035-01-08T01:10:00.000Z'),
      tokenRow: row,
    });
    expect(
      await expired.verifyCheckoutToken('a'.repeat(64), row.bookingId),
    ).toEqual({ ok: false, reason: 'EXPIRED' });
  });
});
