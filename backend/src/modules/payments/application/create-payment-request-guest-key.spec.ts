import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException, GoneException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreatePaymentRequestUseCase } from './create-payment-request.use-case.js';
import type { PayosGatewayAdapter } from '../infrastructure/payos-gateway.adapter.js';
import type { PayosDemoGatewayAdapter } from '../infrastructure/payos-demo-gateway.adapter.js';
import type {
  PaymentStore,
  StoredPaymentRequest,
} from '../ports/payment-store.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';

const BOOKING_ID = '0b9d3a3f-2f7e-4b6c-9a1f-1f2e3d4c5b6a';

function request(
  overrides: Partial<StoredPaymentRequest> = {},
): StoredPaymentRequest {
  return {
    id: 'req-1',
    paymentCode: 'PAY-ABC',
    referenceId: BOOKING_ID,
    purpose: 'PREPAYMENT',
    amount: 30_000,
    currency: 'VND',
    method: 'PAYOS_TRANSFER',
    provider: 'PAYOS',
    providerOrderCode: null,
    providerPaymentLinkId: null,
    checkoutUrl: null,
    vietQrPayload: null,
    status: 'CREATING',
    expiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date(),
    idempotencyKey: `pay_guest_${BOOKING_ID}`,
    ...overrides,
  };
}

function setup() {
  const transaction = {
    paymentRequest: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const store = {
    withTransaction: jest.fn(
      async (
        work: (
          tx: TransactionContext,
          paymentStore: PaymentStore,
        ) => Promise<unknown>,
      ) =>
        work(
          transaction as unknown as TransactionContext,
          store as unknown as PaymentStore,
        ),
    ),
    lockBookingMoney: jest.fn(),
    databaseNow: jest.fn(async () => new Date()),
    readBookingMoney: jest.fn(async () => ({
      bookingId: BOOKING_ID,
      userId: null,
      status: 'HOLDING',
      totalAmount: 100_000,
      requiredPrepaymentAmount: 30_000,
      holdExpiresAt: new Date(Date.now() + 300_000),
      allocatedReceiptAmounts: [],
      completedRefundAmounts: [],
    })),
    findRequestReplay: jest.fn(),
    findOpenRequestForBooking: jest.fn(),
    insertPaymentRequest: jest.fn(),
    readPaymentRequest: jest.fn(),
    retryFailedRequest: jest.fn(),
  };
  const gateway = {
    isConfigured: jest.fn(() => false),
    createLink: jest.fn(),
  };
  const demoGateway = {
    isDemoAvailable: jest.fn(() => false),
    createDemoLink: jest.fn(),
  };
  const useCase = new CreatePaymentRequestUseCase(
    store as unknown as PaymentStore,
    gateway as unknown as PayosGatewayAdapter,
    demoGateway as unknown as PayosDemoGatewayAdapter,
    new ConfigService({}),
  );
  return { transaction, store, gateway, demoGateway, useCase };
}

const INPUT = {
  bookingId: BOOKING_ID,
  purpose: 'PREPAYMENT' as const,
  prepaymentPercent: 30 as const,
  method: 'PAYOS_TRANSFER' as const,
  idempotencyKey: `booking-checkout:${BOOKING_ID}`,
};

describe('guest durable payment intent (Bước 3)', () => {
  it('guest PREPAYMENT luôn replay bằng khóa canonical pay_guest_{bookingId}', async () => {
    const { store, useCase } = setup();
    store.findRequestReplay.mockResolvedValue(request());
    const result = await useCase.execute({ userId: null }, INPUT);
    expect(result.id).toBe('req-1');
    expect(store.findRequestReplay).toHaveBeenCalledWith(
      expect.anything(),
      `pay_guest_${BOOKING_ID}`,
    );
    expect(store.insertPaymentRequest).not.toHaveBeenCalled();
  });

  it('tái sử dụng request còn sống của booking khi khóa cũ khác', async () => {
    const { store, useCase } = setup();
    store.findRequestReplay.mockResolvedValue(null);
    // Key legacy (không đúng format canonical) vẫn được tái sử dụng theo
    // AC3.1-5 — nhận diện guest bằng booking facts, không bằng format key.
    store.findOpenRequestForBooking.mockResolvedValue(
      request({
        status: 'PENDING',
        vietQrPayload: 'qr-old',
        idempotencyKey: 'legacy-old-key',
      }),
    );
    const result = await useCase.execute({ userId: null }, INPUT);
    expect(result.status).toBe('PENDING');
    expect(result.vietQrPayload).toBe('qr-old');
    expect(store.findOpenRequestForBooking).toHaveBeenCalledWith(
      expect.anything(),
      BOOKING_ID,
      'PREPAYMENT',
    );
    expect(store.insertPaymentRequest).not.toHaveBeenCalled();
  });

  it('replay khác số tiền bị 409, không tạo request thứ hai', async () => {
    const { store, useCase } = setup();
    store.findRequestReplay.mockResolvedValue(null);
    store.findOpenRequestForBooking.mockResolvedValue(
      request({ amount: 10_000 }),
    );
    await expect(
      useCase.execute({ userId: null }, INPUT),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.insertPaymentRequest).not.toHaveBeenCalled();
  });

  it('order code deterministic qua mọi lần retry/reconcile', async () => {
    const { transaction, store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue(request());
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-1',
      checkoutUrl: 'https://pay.example/1',
      qrCode: 'qr',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    transaction.paymentRequest.updateMany.mockResolvedValue({ count: 1 });
    transaction.paymentRequest.findUnique.mockResolvedValue(
      request({ status: 'PENDING' }),
    );

    await useCase.recoverOrphanedIntent('req-1');
    await useCase.recoverOrphanedIntent('req-1');

    const codes = gateway.createLink.mock.calls.map(
      (call) => (call[0] as { orderCode: number }).orderCode,
    );
    expect(codes).toHaveLength(2);
    expect(codes[0]).toBe(codes[1]);
    expect(Number.isSafeInteger(codes[0])).toBe(true);
  });

  it('P1-1: replay sau khi hold hết hạn bị 409 và không gọi provider', async () => {
    const { store, gateway, useCase } = setup();
    store.readBookingMoney.mockResolvedValue({
      bookingId: BOOKING_ID,
      userId: null,
      status: 'HOLDING',
      totalAmount: 100_000,
      requiredPrepaymentAmount: 30_000,
      holdExpiresAt: new Date(Date.now() - 60_000),
      allocatedReceiptAmounts: [],
      completedRefundAmounts: [],
    });
    store.findRequestReplay.mockResolvedValue(request());
    gateway.isConfigured.mockReturnValue(true);
    let caught: unknown;
    try {
      await useCase.execute({ userId: null }, INPUT);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      code: 'CHECKOUT_READ_ONLY',
    });
    expect(gateway.createLink).not.toHaveBeenCalled();
  });

  it('P1-1: booking CANCELLED bị chặn trước replay, không gọi provider', async () => {
    const { store, gateway, useCase } = setup();
    store.readBookingMoney.mockResolvedValue({
      bookingId: BOOKING_ID,
      userId: null,
      status: 'CANCELLED',
      totalAmount: 100_000,
      requiredPrepaymentAmount: 30_000,
      holdExpiresAt: new Date(Date.now() + 120_000),
      allocatedReceiptAmounts: [],
      completedRefundAmounts: [],
    });
    store.findRequestReplay.mockResolvedValue(request());
    gateway.isConfigured.mockReturnValue(true);
    await expect(
      useCase.execute({ userId: null }, INPUT),
    ).rejects.toBeInstanceOf(GoneException);
    expect(gateway.createLink).not.toHaveBeenCalled();
  });

  it('P2-2: thua race fill-once trả trạng thái hiện hành, không trả CREATING cũ', async () => {
    const { transaction, store, gateway, useCase } = setup();
    store.findRequestReplay.mockResolvedValue(null);
    store.findOpenRequestForBooking.mockResolvedValue(request());
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-race',
      checkoutUrl: 'https://pay.example/race',
      qrCode: 'qr-race',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    transaction.paymentRequest.updateMany.mockResolvedValue({ count: 0 });
    store.readPaymentRequest.mockResolvedValue(
      request({ status: 'CANCELLED' }),
    );
    const result = await useCase.execute({ userId: null }, INPUT);
    expect(result.status).toBe('CANCELLED');
  });

  it('P2-1: FAILED chưa có link được retry trên cùng intent', async () => {
    const { transaction, store, gateway, useCase } = setup();
    store.findRequestReplay.mockResolvedValue(request({ status: 'FAILED' }));
    store.retryFailedRequest.mockResolvedValue(
      request({ status: 'CREATING' }),
    );
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-retry',
      checkoutUrl: 'https://pay.example/retry',
      qrCode: 'qr-retry',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    transaction.paymentRequest.updateMany.mockResolvedValue({ count: 1 });
    const result = await useCase.execute({ userId: null }, INPUT);
    expect(store.retryFailedRequest).toHaveBeenCalledWith(
      expect.anything(),
      'req-1',
    );
    expect(gateway.createLink).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PENDING');
    expect(store.insertPaymentRequest).not.toHaveBeenCalled();
  });

  it('P2-1: FAILED đã có link không retry mù', async () => {
    const { store, gateway, useCase } = setup();
    store.findRequestReplay.mockResolvedValue(
      request({ status: 'FAILED', providerPaymentLinkId: 'link-old' }),
    );
    gateway.isConfigured.mockReturnValue(true);
    const result = await useCase.execute({ userId: null }, INPUT);
    expect(result.status).toBe('FAILED');
    expect(store.retryFailedRequest).not.toHaveBeenCalled();
    expect(gateway.createLink).not.toHaveBeenCalled();
  });

  it('RR-P1-1: legacy hết hạn trong I/O không persist PENDING', async () => {
    const { transaction, store, gateway, useCase } = setup();
    store.findRequestReplay.mockResolvedValue(null);
    store.findOpenRequestForBooking.mockResolvedValue(
      request({ status: 'CREATING', idempotencyKey: 'legacy-old-key' }),
    );
    // Hold đóng sau khi provider trả link: Phase 3 guard bằng DB facts.
    store.readBookingMoney.mockResolvedValue({
      bookingId: BOOKING_ID,
      userId: null,
      status: 'HOLDING',
      totalAmount: 100_000,
      requiredPrepaymentAmount: 30_000,
      holdExpiresAt: new Date(Date.now() - 1_000),
      allocatedReceiptAmounts: [],
      completedRefundAmounts: [],
    });
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-late',
      checkoutUrl: 'https://pay.example/late',
      qrCode: 'qr-late',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    // createInTransaction chặn trước provider vì hold đã hết (409).
    let caught: unknown;
    try {
      await useCase.execute({ userId: null }, INPUT);
    } catch (error: unknown) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(gateway.createLink).not.toHaveBeenCalled();
    expect(transaction.paymentRequest.updateMany).not.toHaveBeenCalled();
  });
});
