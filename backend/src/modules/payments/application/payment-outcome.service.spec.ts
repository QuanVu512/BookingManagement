import { describe, expect, it, jest } from '@jest/globals';
import { PaymentOutcomeService } from './payment-outcome.service.js';
import type { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    booking: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      ...(overrides.booking as Record<string, unknown> | undefined),
    },
    paymentTransaction: {
      findMany: jest.fn(),
      ...(overrides.paymentTransaction as Record<string, unknown> | undefined),
    },
    refundRequest: {
      findMany: jest.fn(),
      ...(overrides.refundRequest as Record<string, unknown> | undefined),
    },
    paymentRequest: {
      findFirst: jest.fn(),
      ...(overrides.paymentRequest as Record<string, unknown> | undefined),
    },
  };
}

const BOOKING = {
  id: 'booking-1',
  bookingCode: 'BK-001',
  customerName: 'Test User',
  customerPhone: '0900000001',
  customerEmail: 'test@example.com',
  status: 'HOLDING',
  startsAt: new Date('2035-01-08T01:00:00Z'),
  endsAt: new Date('2035-01-08T02:00:00Z'),
  holdExpiresAt: new Date('2035-01-08T01:05:00Z'),
  prepaymentPercent: 30,
  totalAmount: 150_000,
  requiredPrepaymentAmount: 45_000,
  currency: 'VND',
};

describe('PaymentOutcomeService (C07)', () => {
  it('staffLookup tính reservedRefundAmount từ REQUESTED/APPROVED/PROCESSING', async () => {
    const prisma = mockPrisma();
    const service = new PaymentOutcomeService(
      prisma as unknown as PrismaService,
    );
    prisma.booking.findUnique.mockResolvedValue(BOOKING);
    prisma.paymentTransaction.findMany.mockResolvedValue([
      { id: 'r1', amount: 100_000 },
    ]);
    prisma.refundRequest.findMany.mockImplementation(async (args: unknown) => {
      const status = (args as { where: { status: unknown } }).where.status;
      if (status === 'COMPLETED') return [{ amount: 20_000 }];
      return [{ amount: 30_000 }];
    });
    const result = await service.staffLookup('BK-001');
    expect(result?.dto.paymentSummary.reservedRefundAmount).toBe(30_000);
    expect(result?.dto.paymentSummary.refundedAmount).toBe(20_000);
    expect(result?.dto.paymentSummary.paidAmount).toBe(80_000);
  });

  it('bookingDetail đánh dấu recoveryRequired khi CREATING không có checkoutUrl', async () => {
    const prisma = mockPrisma();
    const service = new PaymentOutcomeService(
      prisma as unknown as PrismaService,
    );
    prisma.booking.findFirst.mockResolvedValue({ id: BOOKING.id });
    prisma.booking.findUnique.mockResolvedValue(BOOKING);
    prisma.paymentTransaction.findMany.mockResolvedValue([]);
    prisma.refundRequest.findMany.mockResolvedValue([]);
    prisma.paymentRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      paymentCode: 'PAY-1',
      status: 'CREATING',
      amount: 45_000,
      checkoutUrl: null,
    });
    const detail = await service.bookingDetail(BOOKING.id, {
      userId: 'user-1',
    });
    expect(detail?.activePaymentRequest?.recoveryRequired).toBe(true);
  });

  it('bookingDetail không đánh dấu recovery khi đã có checkoutUrl', async () => {
    const prisma = mockPrisma();
    const service = new PaymentOutcomeService(
      prisma as unknown as PrismaService,
    );
    prisma.booking.findFirst.mockResolvedValue({ id: BOOKING.id });
    prisma.booking.findUnique.mockResolvedValue(BOOKING);
    prisma.paymentTransaction.findMany.mockResolvedValue([]);
    prisma.refundRequest.findMany.mockResolvedValue([]);
    prisma.paymentRequest.findFirst.mockResolvedValue({
      id: 'req-1',
      paymentCode: 'PAY-1',
      status: 'PENDING',
      amount: 45_000,
      checkoutUrl: 'https://pay.example/abc',
    });
    const detail = await service.bookingDetail(BOOKING.id, {
      userId: 'user-1',
    });
    expect(detail?.activePaymentRequest?.recoveryRequired).toBe(false);
  });
});
