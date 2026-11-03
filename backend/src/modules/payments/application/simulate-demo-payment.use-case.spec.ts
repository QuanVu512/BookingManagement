import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { SimulateDemoPaymentUseCase } from './simulate-demo-payment.use-case.js';
import { PayosDemoSigner } from '../infrastructure/payos-demo-signer.js';
import type { PaymentStore } from '../ports/payment-store.js';
import type { PayosSignatureService } from '../infrastructure/payos-signature.service.js';
import type { PayosWebhookInbox } from '../infrastructure/payos-webhook-inbox.js';
import type { VerifyReceiptUseCase } from './verify-receipt.use-case.js';
import type { PaymentOutcomeService } from './payment-outcome.service.js';
import type { PaymentAuditLogger } from '../infrastructure/payment-audit-logger.js';

const REQUEST = {
  id: 'req-demo-1',
  paymentCode: 'PAY-DEMO12345678',
  referenceId: 'booking-demo-1',
  purpose: 'PREPAYMENT',
  amount: 45000,
  currency: 'VND',
  method: 'PAYOS_TRANSFER',
  provider: 'PAYOS',
  providerOrderCode: '1000001',
  providerPaymentLinkId: 'DEMO_PAY-DEMO12345678',
  checkoutUrl: 'http://localhost:4001/payment/result?code=PAY-DEMO12345678',
  vietQrPayload: 'DEMO-SIMULATION:PAY-DEMO12345678',
  status: 'PENDING',
  expiresAt: new Date(Date.now() + 900_000),
  createdAt: new Date(),
};

function setup(env: Record<string, string | undefined> = {}) {
  const fullEnv = {
    ENABLE_PAYMENT_SIMULATION: 'true',
    PAYOS_CHECKSUM_KEY: 'demo-checksum-key-for-tests-only',
    ...env,
  };
  const config = { get: (key: string) => fullEnv[key] } as ConfigService;
  const store = {
    withTransaction: jest.fn(
      async (work: (t: never, s: never) => Promise<unknown>) =>
        work(undefined as never, store as never),
    ),
    readPaymentRequest: jest.fn(async () => ({ ...REQUEST })),
    findRequestsByOrderCode: jest.fn(async () => [{ ...REQUEST }]),
  };
  const inbox = {
    ingest: jest.fn(async () => ({
      eventId: 'event-demo-1',
      status: 'RECEIVED' as const,
      deduplicationKey: 'PAYOS::PAYMENT::PAY-DEMO12345678',
    })),
    claim: jest.fn(async () => ({ generation: 1 })),
    finalize: jest.fn(async () => true),
  };
  const receipts = {
    execute: jest.fn(async () => ({
      receiptId: 'receipt-1',
      status: 'ALLOCATED' as const,
      confirmEligible: true,
    })),
  };
  const outcomes = {
    ownsBooking: jest.fn(async () => true),
    statusForRequest: jest.fn(async () => ({
      paymentCode: REQUEST.paymentCode,
      screen: 'SCR04_SUCCESS',
      bookingStatus: 'CONFIRMED',
    })),
  };
  const signatures = { isConfigured: jest.fn(() => true) };
  const audit = { log: jest.fn(async () => undefined) };
  const useCase = new SimulateDemoPaymentUseCase(
    store as unknown as PaymentStore,
    new PayosDemoSigner(config),
    signatures as unknown as PayosSignatureService,
    inbox as unknown as PayosWebhookInbox,
    receipts as unknown as VerifyReceiptUseCase,
    outcomes as unknown as PaymentOutcomeService,
    audit as unknown as PaymentAuditLogger,
  );
  return { store, inbox, receipts, outcomes, signatures, audit, useCase };
}

describe('SimulateDemoPaymentUseCase (BE-PAY-DEMO, F01/F04/F05)', () => {
  it('rejects real provider links without ingesting', async () => {
    const { store, inbox, useCase } = setup();
    store.readPaymentRequest.mockResolvedValueOnce({
      ...REQUEST,
      providerPaymentLinkId: 'real-link',
    });
    await expect(
      useCase.execute(REQUEST.id, { userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(inbox.ingest).not.toHaveBeenCalled();
  });
  it('rejects expired requests without ingesting', async () => {
    const { store, inbox, useCase } = setup();
    store.readPaymentRequest.mockResolvedValueOnce({
      ...REQUEST,
      expiresAt: new Date(0),
    });
    await expect(
      useCase.execute(REQUEST.id, { userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(inbox.ingest).not.toHaveBeenCalled();
  });
  it('authorizes the owner after orderCode lookup', async () => {
    const { store, outcomes, inbox, useCase } = setup();
    outcomes.ownsBooking.mockResolvedValueOnce(false);
    await expect(
      useCase.executeForOrderCode(1000001, { userId: 'other' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(store.findRequestsByOrderCode).toHaveBeenCalledWith(1000001);
    expect(inbox.ingest).not.toHaveBeenCalled();
  });
  it('rejects missing or colliding orderCodes', async () => {
    const { store, inbox, useCase } = setup();
    store.findRequestsByOrderCode.mockResolvedValueOnce([]);
    await expect(
      useCase.executeForOrderCode(1, { userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 404 });
    store.findRequestsByOrderCode.mockResolvedValueOnce([
      { ...REQUEST },
      { ...REQUEST, id: 'other' },
    ]);
    await expect(
      useCase.executeForOrderCode(1, { userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(inbox.ingest).not.toHaveBeenCalled();
  });

  it('đóng khi cờ tắt (404, không ký/không ghi tiền)', async () => {
    const { store, inbox, receipts, useCase } = setup({
      ENABLE_PAYMENT_SIMULATION: 'false',
    });
    await expect(
      useCase.execute('req-demo-1', {
        userId: 'user-1',
        actorUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(inbox.ingest).not.toHaveBeenCalled();
    expect(receipts.execute).not.toHaveBeenCalled();
    expect(store.readPaymentRequest).not.toHaveBeenCalled();
  });

  it('chặn IDOR: đơn của người khác trả 404', async () => {
    const { outcomes, inbox, useCase } = setup();
    outcomes.ownsBooking.mockResolvedValueOnce(false);
    await expect(
      useCase.execute('req-demo-1', {
        userId: 'user-2',
        actorUserId: 'user-2',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(inbox.ingest).not.toHaveBeenCalled();
  });

  it('từ chối kênh không phải payOS và trạng thái cuối', async () => {
    const { store, useCase } = setup();
    store.readPaymentRequest.mockResolvedValueOnce({
      ...REQUEST,
      method: 'CASH',
    });
    await expect(
      useCase.execute('req-demo-1', { userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 409 });
    store.readPaymentRequest.mockResolvedValueOnce({
      ...REQUEST,
      status: 'PAID',
    });
    await expect(
      useCase.execute('req-demo-1', { userId: 'user-1' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('happy path: ký → ingest → xử lý → outcome server-confirmed', async () => {
    const { inbox, receipts, outcomes, useCase } = setup();
    const result = await useCase.execute('req-demo-1', {
      userId: 'user-1',
      actorUserId: 'user-1',
    });
    expect(result.status).toBe('processed');
    const envelope = inbox.ingest.mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
      signature: string;
    };
    expect(envelope.data.reference).toBe('PAY-DEMO12345678');
    expect(envelope.data.amount).toBe(45000);
    expect(typeof envelope.signature).toBe('string');
    const funds = receipts.execute.mock.calls[0]?.[1] as {
      transactionReference: string;
      amount: number;
    };
    expect(funds.transactionReference).toBe('PAY-DEMO12345678');
    expect(funds.amount).toBe(45000);
    expect(outcomes.statusForRequest).toHaveBeenCalled();
    expect(result.outcome).toMatchObject({ screen: 'SCR04_SUCCESS' });
  });

  it('claim trượt (scanner thắng race) thì trả accepted, không credit thêm', async () => {
    const { inbox, receipts, useCase } = setup();
    inbox.claim.mockResolvedValueOnce(null);
    const result = await useCase.execute('req-demo-1', { userId: 'user-1' });
    expect(result.status).toBe('accepted');
    expect(receipts.execute).not.toHaveBeenCalled();
    expect(inbox.finalize).not.toHaveBeenCalled();
  });

  it('guest đúng booking được mô phỏng; sai booking bị chặn', async () => {
    const { outcomes, inbox, useCase } = setup();
    const ok = await useCase.execute('req-demo-1', {
      userId: null,
      guestBookingId: 'booking-demo-1',
    });
    expect(ok.status).toBe('processed');
    outcomes.ownsBooking.mockResolvedValueOnce(false);
    await expect(
      useCase.execute('req-demo-1', {
        userId: null,
        guestBookingId: 'booking-other',
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(inbox.ingest).toHaveBeenCalledTimes(1);
  });
});
