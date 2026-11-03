import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { CreatePaymentRequestUseCase } from './create-payment-request.use-case.js';
import type { PayosGatewayAdapter } from '../infrastructure/payos-gateway.adapter.js';
import type { PayosDemoGatewayAdapter } from '../infrastructure/payos-demo-gateway.adapter.js';
import type { PaymentStore } from '../ports/payment-store.js';
import type { TransactionContext } from '../../../infrastructure/prisma/transaction-context.js';

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
          transaction: TransactionContext,
          store: PaymentStore,
        ) => Promise<unknown>,
      ) =>
        work(
          transaction as unknown as TransactionContext,
          store as unknown as PaymentStore,
        ),
    ),
    readPaymentRequest: jest.fn(),
    databaseNow: jest.fn(async () => new Date()),
    readBookingMoney: jest.fn(async () => ({
      bookingId: 'booking-1',
      userId: null,
      status: 'HOLDING',
      totalAmount: 150_000,
      requiredPrepaymentAmount: 45_000,
      holdExpiresAt: new Date(Date.now() + 300_000),
      allocatedReceiptAmounts: [],
      completedRefundAmounts: [],
    })),
  };
  const gateway = {
    isConfigured: jest.fn(),
    createLink: jest.fn(),
  };
  const demoGateway = {
    isDemoAvailable: jest.fn(() => false),
    createDemoLink: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };
  const useCase = new CreatePaymentRequestUseCase(
    store as unknown as PaymentStore,
    gateway as unknown as PayosGatewayAdapter,
    demoGateway as unknown as PayosDemoGatewayAdapter,
    config as unknown as ConfigService,
  );
  return { transaction, store, gateway, demoGateway, config, useCase };
}

const CREATING = {
  id: 'req-1',
  paymentCode: 'PAY-ABC',
  referenceId: 'booking-1',
  purpose: 'PREPAYMENT',
  amount: 45_000,
  currency: 'VND',
  method: 'PAYOS_TRANSFER',
  provider: 'PAYOS',
  providerOrderCode: null,
  providerPaymentLinkId: null,
  checkoutUrl: null,
  vietQrPayload: null,
  status: 'CREATING',
  expiresAt: new Date(Date.now() + 900_000),
  createdAt: new Date(Date.now() - 600_000),
  idempotencyKey: 'legacy-member-key',
};

describe('recoverOrphanedIntent (C07)', () => {
  it('trả nguyên khi row đã vượt CREATING (không downgrade)', async () => {
    const { store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue({
      ...CREATING,
      status: 'PENDING',
      providerPaymentLinkId: 'link-1',
    });
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.status).toBe('PENDING');
    expect(gateway.createLink).not.toHaveBeenCalled();
  });

  it('trả nguyên khi đã có link (không tạo link thứ hai)', async () => {
    const { store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue({
      ...CREATING,
      providerPaymentLinkId: 'link-1',
    });
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.providerPaymentLinkId).toBe('link-1');
    expect(gateway.createLink).not.toHaveBeenCalled();
  });

  it('giữ CREATING khi gateway chưa cấu hình (không suy FAILED)', async () => {
    const { store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue({ ...CREATING });
    gateway.isConfigured.mockReturnValue(false);
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.status).toBe('CREATING');
    expect(gateway.createLink).not.toHaveBeenCalled();
  });

  it('fill link PENDING khi provider thành công và row còn CREATING', async () => {
    const { transaction, store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue({ ...CREATING });
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-9',
      checkoutUrl: 'https://pay.example/9',
      qrCode: 'qr',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    transaction.paymentRequest.updateMany.mockResolvedValue({ count: 1 });
    transaction.paymentRequest.findUnique.mockResolvedValue({
      ...CREATING,
      status: 'PENDING',
    });
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.status).toBe('PENDING');
    expect(transaction.paymentRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'req-1', status: 'CREATING' } }),
    );
  });

  it('giữ CREATING khi provider lỗi (lần quét sau thử lại)', async () => {
    const { store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue({ ...CREATING });
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockRejectedValue(new Error('timeout'));
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.status).toBe('CREATING');
  });

  it('giữ CREATING khi thua race fill-once (row đã đổi)', async () => {
    const { transaction, store, gateway, useCase } = setup();
    store.readPaymentRequest
      .mockResolvedValueOnce({ ...CREATING })
      .mockResolvedValueOnce({ ...CREATING, status: 'CANCELLED' });
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-9',
      checkoutUrl: 'https://pay.example/9',
      qrCode: 'qr',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    transaction.paymentRequest.updateMany.mockResolvedValue({ count: 0 });
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.status).toBe('CANCELLED');
  });

  it('trả null khi row không tồn tại', async () => {
    const { store, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue(null);
    await expect(useCase.recoverOrphanedIntent('missing')).resolves.toBeNull();
  });

  it('RR-P1-1: reconciler không gọi provider cho intent legacy đã hết hạn', async () => {
    const { store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue({
      ...CREATING,
      idempotencyKey: 'legacy-old-key',
    });
    store.readBookingMoney.mockResolvedValue({
      bookingId: 'booking-1',
      userId: null,
      status: 'HOLDING',
      totalAmount: 150_000,
      requiredPrepaymentAmount: 45_000,
      holdExpiresAt: new Date(Date.now() - 60_000),
      allocatedReceiptAmounts: [],
      completedRefundAmounts: [],
    });
    gateway.isConfigured.mockReturnValue(true);
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.status).toBe('CREATING');
    expect(gateway.createLink).not.toHaveBeenCalled();
  });

  it('RR-P1-1 control: intent legacy còn hạn vẫn được fill như canonical', async () => {
    const { transaction, store, gateway, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue({
      ...CREATING,
      idempotencyKey: 'legacy-old-key',
    });
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-legacy',
      checkoutUrl: 'https://pay.example/legacy',
      qrCode: 'qr-legacy',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    transaction.paymentRequest.updateMany.mockResolvedValue({ count: 1 });
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(gateway.createLink).toHaveBeenCalledTimes(1);
    expect(result?.status).toBe('PENDING');
    expect(result?.providerPaymentLinkId).toBe('link-legacy');
  });

  it('RR-P1-1: legacy hold đóng trong lúc I/O thì Phase 3 không persist', async () => {
    const { transaction, store, gateway, useCase } = setup();
    const open = {
      bookingId: 'booking-1',
      userId: null,
      status: 'HOLDING',
      totalAmount: 150_000,
      requiredPrepaymentAmount: 45_000,
      holdExpiresAt: new Date(Date.now() + 300_000),
      allocatedReceiptAmounts: [],
      completedRefundAmounts: [],
    };
    const closed = { ...open, holdExpiresAt: new Date(Date.now() - 1_000) };
    store.readPaymentRequest
      .mockResolvedValueOnce({
        ...CREATING,
        idempotencyKey: 'legacy-old-key',
      })
      .mockResolvedValue({ ...CREATING, idempotencyKey: 'legacy-old-key' });
    // Pre-I/O còn hạn (2 lần check: recover + attach) → gọi provider;
    // post-I/O đã hết hạn → skip persist.
    store.readBookingMoney
      .mockResolvedValueOnce(open)
      .mockResolvedValueOnce(open)
      .mockResolvedValue(closed);
    gateway.isConfigured.mockReturnValue(true);
    gateway.createLink.mockResolvedValue({
      paymentLinkId: 'link-late',
      checkoutUrl: 'https://pay.example/late',
      qrCode: 'qr-late',
      accountNumber: '123',
      accountName: 'Test',
      bin: '970422',
    });
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(gateway.createLink).toHaveBeenCalledTimes(1);
    expect(transaction.paymentRequest.updateMany).not.toHaveBeenCalled();
    expect(result?.status).toBe('CREATING');
    expect(result?.providerPaymentLinkId).toBeNull();
  });

  it.each([false, true])(
    'cờ demo bật không gọi provider thật (configured=%s)',
    async (configured) => {
      const { transaction, store, gateway, demoGateway, useCase } = setup();
      store.readPaymentRequest.mockResolvedValue({ ...CREATING });
      gateway.isConfigured.mockReturnValue(configured);
      demoGateway.isDemoAvailable.mockReturnValue(true);
      demoGateway.createDemoLink.mockResolvedValue({
        paymentLinkId: 'DEMO_PAY-ABC',
        orderCode: 1000001,
        checkoutUrl: 'http://localhost:4001/payment/result?code=PAY-ABC',
        qrCode: 'DEMO-SIMULATION:PAY-ABC',
        accountNumber: 'DEMO_888888',
        accountName: 'SHOWCASE DEMO (KHONG THU TIEN)',
        bin: '',
      });
      transaction.paymentRequest.updateMany.mockResolvedValue({ count: 1 });
      transaction.paymentRequest.findUnique.mockResolvedValue({
        ...CREATING,
        status: 'PENDING',
      });
      const result = await useCase.recoverOrphanedIntent('req-1');
      expect(result?.status).toBe('PENDING');
      expect(result?.providerPaymentLinkId).toBe('DEMO_PAY-ABC');
      expect(gateway.createLink).not.toHaveBeenCalled();
    },
  );
});
