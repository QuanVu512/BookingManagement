import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { CreatePaymentRequestUseCase } from './create-payment-request.use-case.js';
import type { PayosGatewayAdapter } from '../infrastructure/payos-gateway.adapter.js';
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
      ) => work(transaction as unknown as TransactionContext, store as unknown as PaymentStore),
    ),
    readPaymentRequest: jest.fn(),
  };
  const gateway = {
    isConfigured: jest.fn(),
    createLink: jest.fn(),
  };
  const config = {
    get: jest.fn(),
  };
  const useCase = new CreatePaymentRequestUseCase(
    store as unknown as PaymentStore,
    gateway as unknown as PayosGatewayAdapter,
    config as unknown as ConfigService,
  );
  return { transaction, store, gateway, config, useCase };
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
    transaction.paymentRequest.updateMany.mockResolvedValue({ count: 0 });
    const result = await useCase.recoverOrphanedIntent('req-1');
    expect(result?.status).toBe('CREATING');
  });

  it('trả null khi row không tồn tại', async () => {
    const { store, useCase } = setup();
    store.readPaymentRequest.mockResolvedValue(null);
    await expect(useCase.recoverOrphanedIntent('missing')).resolves.toBeNull();
  });
});
