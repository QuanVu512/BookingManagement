import { GuestTokenService } from './guest-token.service.js';

function service(): GuestTokenService {
  const prisma = {
    bookingAccessToken: {
      create: async () => ({ id: 'token-id' }),
      findUnique: async () => null,
      updateMany: async () => ({ count: 1 }),
    },
  };
  const config = { get: (key: string) => (key === 'GUEST_MANAGE_TOKEN_TTL_DAYS' ? '30' : undefined) };
  return new GuestTokenService(
    prisma as never,
    config as never,
  );
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
});
