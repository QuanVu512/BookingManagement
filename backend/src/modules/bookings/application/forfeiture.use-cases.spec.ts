import { describe, expect, it, jest } from '@jest/globals';
import { StaffLateCancelUseCase } from './staff-late-cancel.use-case.js';
import { MarkNoShowUseCase } from './mark-no-show.use-case.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { PaymentAuditLogger } from '../../payments/infrastructure/payment-audit-logger.js';

// UNVERIFIED (backend test scope BLOCKED) — authored per plan, not executed.
const STARTS_AT = new Date('2035-01-08T01:00:00Z');
const ENDS_AT = new Date('2035-01-08T02:00:00Z');

function setup() {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn(),
    booking: { findUnique: jest.fn(), updateMany: jest.fn() },
    paymentTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    refundRequest: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    courtOccupancy: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    bookingStatusHistory: { create: jest.fn() },
    bookingCancellationRequest: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    outboxEvent: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(tx)),
  };
  const audit = { logInTransaction: jest.fn() };
  return {
    tx,
    lateCancel: new StaffLateCancelUseCase(
      prisma as unknown as PrismaService,
      audit as unknown as PaymentAuditLogger,
    ),
    markNoShow: new MarkNoShowUseCase(
      prisma as unknown as PrismaService,
      audit as unknown as PaymentAuditLogger,
    ),
  };
}

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    bookingCode: 'BK-1',
    status: 'CONFIRMED',
    version: 5,
    totalAmount: 1_000_000,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    ...overrides,
  };
}

describe('StaffLateCancelUseCase (D16)', () => {
  it('400 khi thiếu lý do', async () => {
    const { lateCancel } = setup();
    await expect(
      lateCancel.execute({
        bookingId: 'booking-1',
        staffUserId: 'staff-1',
        reason: 'ok',
        idempotencyKey: 'k'.repeat(16),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('từ chối đơn không CONFIRMED', async () => {
    const { tx, lateCancel } = setup();
    tx.$queryRaw.mockResolvedValue([{ now: STARTS_AT }]);
    tx.booking.findUnique.mockResolvedValue(bookingRow({ status: 'HOLDING' }));
    await expect(
      lateCancel.execute({
        bookingId: 'booking-1',
        staffUserId: 'staff-1',
        reason: 'Khách xin hủy muộn.',
        idempotencyKey: 'k'.repeat(16),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('409 ngoài cửa sổ muộn (dùng flow thường)', async () => {
    const { tx, lateCancel } = setup();
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(STARTS_AT.getTime() - 13 * 3_600_000) },
    ]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    await expect(
      lateCancel.execute({
        bookingId: 'booking-1',
        staffUserId: 'staff-1',
        reason: 'Khách xin hủy muộn.',
        idempotencyKey: 'k'.repeat(16),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('paid100 → CANCELLED + giữ 300k + hoàn 700k + audit', async () => {
    const { tx, lateCancel } = setup();
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(STARTS_AT.getTime() - 3_600_000) },
    ]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.paymentTransaction.findMany.mockResolvedValue([
      { id: 'r1', amount: 1_000_000 },
    ]);
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.bookingCancellationRequest.create.mockImplementation(
      async (args: unknown) => ({ id: 'forf-1', ...(args as object) }),
    );
    tx.refundRequest.create.mockImplementation(async (args: unknown) => ({
      id: 'refund-1',
      ...(args as object),
    }));
    const result = await lateCancel.execute({
      bookingId: 'booking-1',
      staffUserId: 'staff-1',
      reason: 'Khách ốm, xin hủy muộn.',
      idempotencyKey: 'k'.repeat(16),
    });
    expect(result).toMatchObject({
      status: 'CANCELLED',
      forfeitedDeposit: 300_000,
      totalRefund: 700_000,
      replayed: false,
    });
    expect(tx.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'CONFIRMED' }),
        data: expect.objectContaining({ status: 'CANCELLED' }),
      }),
    );
    const forfeitArg = tx.bookingCancellationRequest.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(forfeitArg.data.penaltyPercent).toBe(30);
    expect(forfeitArg.data.status).toBe('APPLIED');
    expect(forfeitArg.data.actorType).toBe('STAFF');
  });

  it('replay cùng key → không tạo mới', async () => {
    const { tx, lateCancel } = setup();
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(STARTS_AT.getTime() - 3_600_000) },
    ]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.bookingCancellationRequest.findUnique.mockResolvedValue({
      id: 'forf-1',
      penaltyAmount: { toString: () => '300000' },
      refundAmount: { toString: () => '700000' },
    });
    tx.refundRequest.findMany.mockResolvedValue([{ id: 'refund-1' }]);
    const result = await lateCancel.execute({
      bookingId: 'booking-1',
      staffUserId: 'staff-1',
      reason: 'Khách ốm, xin hủy muộn.',
      idempotencyKey: 'k'.repeat(16),
    });
    expect(result.replayed).toBe(true);
    expect(tx.bookingCancellationRequest.create).not.toHaveBeenCalled();
  });
});

describe('MarkNoShowUseCase (D03)', () => {
  it('409 khi chưa hết giờ hoặc không CONFIRMED', async () => {
    const { tx, markNoShow } = setup();
    tx.$queryRaw.mockResolvedValue([{ now: STARTS_AT }]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    await expect(
      markNoShow.execute({
        bookingId: 'booking-1',
        idempotencyKey: 'k'.repeat(16),
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('paid30 → NO_SHOW, không refund, waive 70%', async () => {
    const { tx, markNoShow } = setup();
    tx.$queryRaw.mockResolvedValue([
      { now: new Date(ENDS_AT.getTime() + 60_000) },
    ]);
    tx.booking.findUnique.mockResolvedValue(bookingRow());
    tx.paymentTransaction.findMany.mockResolvedValue([
      { id: 'r1', amount: 300_000 },
    ]);
    tx.booking.updateMany.mockResolvedValue({ count: 1 });
    tx.bookingCancellationRequest.create.mockImplementation(
      async (args: unknown) => ({ id: 'forf-9', ...(args as object) }),
    );
    const result = await markNoShow.execute({
      bookingId: 'booking-1',
      idempotencyKey: 'k'.repeat(16),
    });
    expect(result).toMatchObject({
      status: 'NO_SHOW',
      forfeitedDeposit: 300_000,
      totalRefund: 0,
      replayed: false,
    });
    expect(tx.refundRequest.create).not.toHaveBeenCalled();
    expect(tx.booking.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'NO_SHOW' }),
      }),
    );
  });
});
