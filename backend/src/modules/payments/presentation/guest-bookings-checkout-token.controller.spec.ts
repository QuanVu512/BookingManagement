import { describe, expect, it, jest } from '@jest/globals';
import {
  GuestBookingsController,
  type GuestLookupContactDto,
} from './guest-bookings.controller.js';
import { guestPaymentIdempotencyKey } from '../payment.constants.js';

function setup() {
  const createPaymentRequest = {
    execute: jest.fn(async () => ({
      id: 'pr-1',
      paymentCode: 'PAY-1',
      referenceId: 'bk-1',
      purpose: 'PREPAYMENT',
      amount: 90000,
      currency: 'VND',
      method: 'PAYOS_TRANSFER',
      providerOrderCode: null,
      providerPaymentLinkId: null,
      checkoutUrl: 'https://pay.example/x',
      vietQrPayload: '000201QR',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 240000),
      createdAt: new Date(),
      idempotencyKey: 'pay_guest_bk-1',
    })),
  };
  const requestRecoveryLink = {
    execute: jest.fn(async () => ({ message: 'generic' })),
  };
  const controller = new GuestBookingsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    requestRecoveryLink as never,
    createPaymentRequest as never,
  );
  return { controller, createPaymentRequest, requestRecoveryLink };
}

describe('GuestBookingsController (S5-01/S5-06)', () => {
  it('tạo PREPAYMENT bằng checkout token với khóa chuẩn và subject guest', async () => {
    const { controller, createPaymentRequest } = setup();
    const result = await controller.createGuestPrepaymentRequest('bk-1', {});
    expect(createPaymentRequest.execute).toHaveBeenCalledTimes(1);
    const [subject, input] = createPaymentRequest.execute.mock.calls[0] as [
      { userId: null },
      Record<string, unknown>,
    ];
    expect(subject).toEqual({ userId: null });
    expect(input).toMatchObject({
      bookingId: 'bk-1',
      purpose: 'PREPAYMENT',
      idempotencyKey: guestPaymentIdempotencyKey('bk-1'),
    });
    expect(result).toEqual({
      success: true,
      data: expect.objectContaining({
        id: 'pr-1',
        status: 'PENDING',
        vietQrPayload: '000201QR',
      }),
    });
  });

  it('tra cứu truyền IP của client vào use-case để quota IP trả 202 generic', async () => {
    const { controller, requestRecoveryLink } = setup();
    const body = { contact: 'a@example.com' } as GuestLookupContactDto;
    const result = await controller.lookup(body, '10.0.0.9');
    expect(requestRecoveryLink.execute).toHaveBeenCalledWith(
      'a@example.com',
      '10.0.0.9',
    );
    expect(result).toEqual({ success: true, message: 'generic' });
  });
});
