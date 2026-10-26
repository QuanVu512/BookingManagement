import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { MintCheckinTokenUseCase } from './mint-checkin-token.use-case.js';
import { VerifyCheckinUseCase } from './verify-checkin.use-case.js';
import { ManualCheckinUseCase } from './manual-checkin.use-case.js';
import { CompleteBookingUseCase } from './complete-booking.use-case.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

const STARTS_AT = new Date('2035-01-08T01:00:00Z');
const ENDS_AT = new Date('2035-01-08T02:00:00Z');

function setup(configValues: Record<string, string> = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(),
    booking: { findUnique: jest.fn(), updateMany: jest.fn() },
    bookingCheckin: { findUnique: jest.fn(), create: jest.fn() },
    bookingAccessToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    paymentTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    refundRequest: { findMany: jest.fn().mockResolvedValue([]) },
    bookingStatusHistory: { create: jest.fn() },
    outboxEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const transactionSpy = prisma.$transaction;
  const config = {
    get: jest.fn((name: string) => configValues[name]),
  };
  const windowed = {
    CHECKIN_WINDOW_MINUTES_BEFORE_START: '30',
    CHECKIN_WINDOW_MINUTES_AFTER_START: '15',
  };
  return {
    tx,
    prisma: prisma as unknown as PrismaService,
    transactionSpy,
    config: config as unknown as ConfigService,
    windowed,
    mint: () =>
      new MintCheckinTokenUseCase(
        prisma as unknown as PrismaService,
        { get: ((name: string) => ({ ...windowed, ...configValues }[name])) } as unknown as ConfigService,
      ),
  };
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    bookingCode: 'BK-1',
    userId: 'user-1',
    status: 'CONFIRMED',
    version: 3,
    totalAmount: 150_000,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    updatedAt: STARTS_AT,
    ...overrides,
  };
}

describe('MintCheckinTokenUseCase (C10)', () => {
  it('fail-closed 503 khi config D02 tường minh mà không hợp lệ', async () => {
    const { transactionSpy } = setup();
    const badConfig = {
      get: (_name: string) => 'abc',
    } as unknown as ConfigService;
    const useCase = new MintCheckinTokenUseCase(
      { $transaction: transactionSpy } as unknown as PrismaService,
      badConfig,
    );
    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        actorUserId: 'user-1',
        actorType: 'CUSTOMER',
      }),
    ).rejects.toMatchObject({ status: 503 });
    expect(transactionSpy).not.toHaveBeenCalled();
  });

  it('403 khi không phải chủ đơn', async () => {
    const { tx, mint } = setup();
    tx.$queryRaw.mockResolvedValue([{ now: new Date(STARTS_AT.getTime() - 600_000) }]);
    tx.booking.findUnique.mockResolvedValue(bookingRow({ userId: 'other' }));
    await expect(
      mint().execute({
        bookingId: 'booking-1',
        actorUserId: 'user-1',
        actorType: 'CUSTOMER',
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('409 khi đã check-in hoặc thiếu tiền', async () => {
    const { tx, mint } = setup();
    tx.$queryRaw.mockResolvedValue([{ now: new Date(STARTS_AT.getTime() - 600_000) }]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.bookingCheckin.findUnique.mockResolvedValue({ id: 'ci-1' });
    await expect(
      mint().execute({
        bookingId: 'booking-1',
        actorUserId: 'user-1',
        actorType: 'CUSTOMER',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('cấp token hash-only, thu hồi mã cũ, hết hạn = endsAt', async () => {
    const { tx, mint } = setup();
    tx.$queryRaw.mockResolvedValue([{ now: new Date(STARTS_AT.getTime() - 600_000) }]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.bookingCheckin.findUnique.mockResolvedValue(null);
    tx.paymentTransaction.findMany.mockResolvedValue([{ amount: 150_000 }]);
    tx.bookingAccessToken.updateMany.mockResolvedValue({ count: 1 });
    tx.bookingAccessToken.create.mockImplementation(async (args: unknown) => ({
      id: 'token-1',
      ...(args as object),
    }));
    const result = await mint().execute({
      bookingId: 'booking-1',
      actorUserId: 'user-1',
      actorType: 'CUSTOMER',
    });
    expect(result.checkinToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.expiresAt).toEqual(ENDS_AT);
    const created = tx.bookingAccessToken.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(created.data.purpose).toBe('CHECKIN');
    expect(created.data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(created.data.tokenHash).not.toContain(result.checkinToken);
    expect(tx.bookingAccessToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ purpose: 'CHECKIN' }),
      }),
    );
  });

  it('409 TOO_EARLY ngoài cửa sổ', async () => {
    const { tx, mint } = setup();
    tx.$queryRaw.mockResolvedValue([{ now: new Date(STARTS_AT.getTime() - 31 * 60_000) }]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.bookingCheckin.findUnique.mockResolvedValue(null);
    tx.paymentTransaction.findMany.mockResolvedValue([{ amount: 150_000 }]);
    await expect(
      mint().execute({
        bookingId: 'booking-1',
        actorUserId: 'user-1',
        actorType: 'CUSTOMER',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('VerifyCheckinUseCase QR (C10)', () => {
  it('400 khi token sai định dạng', async () => {
    const { prisma } = setup();
    const useCase = new VerifyCheckinUseCase(prisma);
    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        rawToken: 'short',
        staffUserId: 'staff-1',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('quét thành công: consume + CHECKED_IN + history + outbox', async () => {
    const { tx, prisma } = setup();
    const now = new Date(STARTS_AT.getTime() + 5 * 60_000);
    tx.$queryRaw.mockResolvedValue([{ now }]);
    tx.bookingAccessToken.findUnique.mockResolvedValue({
      id: 'token-1',
      bookingId: 'booking-1',
      purpose: 'CHECKIN',
      revokedAt: null,
      consumedAt: null,
      expiresAt: ENDS_AT,
    });
    tx.bookingAccessToken.updateMany.mockResolvedValue({ count: 1 });
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.bookingCheckin.findUnique.mockResolvedValue(null);
    tx.paymentTransaction.findMany.mockResolvedValue([{ amount: 150_000 }]);
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.bookingCheckin.create.mockImplementation(async () => ({ id: 'ci-1' }));
    const useCase = new VerifyCheckinUseCase(prisma);
    const result = await useCase.execute({
      bookingId: 'booking-1',
      rawToken: 'a'.repeat(64),
      staffUserId: 'staff-1',
    });
    expect(result).toMatchObject({
      status: 'CHECKED_IN',
      method: 'QR',
      replayed: false,
    });
    expect(tx.bookingStatusHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          fromStatus: 'CONFIRMED',
          toStatus: 'CHECKED_IN',
          actorType: 'STAFF',
        }),
      }),
    );
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'booking.checked-in' }),
      }),
    );
  });

  it('second scan công nhận replay (không 500)', async () => {
    const { tx, prisma } = setup();
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(STARTS_AT.getTime() + 6 * 60_000) },
    ]);
    tx.bookingAccessToken.findUnique.mockResolvedValue({
      id: 'token-1',
      bookingId: 'booking-1',
      purpose: 'CHECKIN',
      revokedAt: null,
      consumedAt: new Date(),
      expiresAt: ENDS_AT,
    });
    tx.bookingCheckin.findUnique.mockResolvedValue({
      id: 'ci-1',
      checkedInAt: STARTS_AT,
      method: 'QR',
    });
    tx.booking.findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue(bookingRow({ status: 'CHECKED_IN' }));
    const useCase = new VerifyCheckinUseCase(prisma);
    const result = await useCase.execute({
      bookingId: 'booking-1',
      rawToken: 'a'.repeat(64),
      staffUserId: 'staff-1',
    });
    expect(result.replayed).toBe(true);
  });

  it('409 khi thiếu tiền dù token đúng (I10)', async () => {
    const { tx, prisma } = setup();
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(STARTS_AT.getTime() + 5 * 60_000) },
    ]);
    tx.bookingAccessToken.findUnique.mockResolvedValue({
      id: 'token-1',
      bookingId: 'booking-1',
      purpose: 'CHECKIN',
      revokedAt: null,
      consumedAt: null,
      expiresAt: ENDS_AT,
    });
    tx.bookingAccessToken.updateMany.mockResolvedValue({ count: 1 });
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.bookingCheckin.findUnique.mockResolvedValue(null);
    tx.paymentTransaction.findMany.mockResolvedValue([{ amount: 45_000 }]);
    const useCase = new VerifyCheckinUseCase(prisma);
    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        rawToken: 'a'.repeat(64),
        staffUserId: 'staff-1',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('ManualCheckinUseCase (C10)', () => {
  it('400 khi thiếu ghi chú', async () => {
    const { prisma, config } = setup();
    const useCase = new ManualCheckinUseCase(prisma, config);
    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        staffUserId: 'staff-1',
        note: 'ok',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('thủ công thành công có audit note', async () => {
    const { tx, prisma, config, windowed } = setup();
    config.get.mockImplementation(
      (name: string) => windowed[name as keyof typeof windowed],
    );
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(STARTS_AT.getTime() + 5 * 60_000) },
    ]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.bookingCheckin.findUnique.mockResolvedValue(null);
    tx.paymentTransaction.findMany.mockResolvedValue([{ amount: 150_000 }]);
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.bookingCheckin.create.mockImplementation(async () => ({ id: 'ci-2' }));
    const useCase = new ManualCheckinUseCase(prisma, config);
    const result = await useCase.execute({
      bookingId: 'booking-1',
      staffUserId: 'staff-1',
      note: 'Khách quên điện thoại, đối chiếu CCCD.',
    });
    expect(result).toMatchObject({ method: 'MANUAL', replayed: false });
    expect(tx.bookingCheckin.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tokenId: null, method: 'MANUAL' }),
      }),
    );
  });
});

describe('CompleteBookingUseCase (C11)', () => {
  it('409 khi chưa check-in hoặc chưa hết giờ', async () => {
    const { tx, prisma } = setup();
    tx.$queryRaw.mockResolvedValue([{ now: STARTS_AT }]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    const useCase = new CompleteBookingUseCase(prisma);
    await expect(
      useCase.execute({
        bookingId: 'booking-1',
        actorUserId: 'staff-1',
        actorType: 'STAFF',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('hoàn tất CHECKED_IN hết giờ + replay an toàn', async () => {
    const { tx, prisma } = setup();
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(ENDS_AT.getTime() + 60_000) },
    ]);
    tx.booking.findUnique.mockResolvedValue(
      bookingRow({ status: 'CHECKED_IN' }),
    );
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    const useCase = new CompleteBookingUseCase(prisma);
    const result = await useCase.execute({
      bookingId: 'booking-1',
      actorUserId: 'staff-1',
      actorType: 'STAFF',
    });
    expect(result).toMatchObject({ status: 'COMPLETED', replayed: false });
    expect(tx.outboxEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'booking.completed' }),
      }),
    );
    tx.booking.findUnique.mockResolvedValue(
      bookingRow({ status: 'COMPLETED' }),
    );
    const replay = await useCase.execute({
      bookingId: 'booking-1',
      actorUserId: 'staff-1',
      actorType: 'STAFF',
    });
    expect(replay.replayed).toBe(true);
  });
});
