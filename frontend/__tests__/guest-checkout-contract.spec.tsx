import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://127.0.0.1:4001',
});

for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  localStorage: dom.window.localStorage,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

const { createRoot } = await import('react-dom/client');
const { GuestBookingModal } =
  await import('../features/payment/components/guest-booking-modal.js');
const { createGuestBooking, verifyGuestBookingOtp } =
  await import('../features/payment/api/payment-service.js');
const {
  createGuestCheckoutIdentity,
  readGuestCheckoutIdentityByBooking,
  saveGuestCheckoutIdentity,
} = await import('../features/payment/api/guest-checkout-identity.js');
const { resolvePendingGuestAccessToken, saveGuestManageToken } = await import(
  '../features/payment/api/guest-manage-token.js'
);

const OTP_PROOF = `gop_${'a'.repeat(64)}`;
const CHECKOUT_RESPONSE = {
  bookingId: '0e6b5b0e-0f5e-4b1c-9b7f-6f4d3a2b1c00',
  bookingCode: 'BK-2027',
  holdExpiresAt: '2027-05-01T02:05:00.000Z',
  totalAmount: 400_000,
  prepaymentAmount: 120_000,
  accessToken: 'manage-token',
  accessTokenExpiresAt: '2027-06-01T00:00:00.000Z',
  checkoutToken: 'checkout-token',
  checkoutTokenExpiresAt: '2027-05-01T02:10:00.000Z',
  checkoutIntentId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  serverNow: '2027-05-01T02:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function bodyOf(fetchCall: unknown[]): Record<string, unknown> {
  const init = fetchCall[1] as RequestInit | undefined;
  if (typeof init?.body !== 'string') {
    throw new Error('Request body is missing');
  }
  return JSON.parse(init.body) as Record<string, unknown>;
}

function setInputValue(input: Element, value: string): void {
  if (!(input instanceof dom.window.HTMLInputElement)) {
    throw new Error('Missing input');
  }
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  );
  if (!descriptor?.set) throw new Error('Missing native input setter');
  descriptor.set.call(input, value);
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

afterEach(() => {
  jest.restoreAllMocks();
  dom.window.sessionStorage.clear();
  dom.window.localStorage.clear();
  dom.window.document.body.innerHTML = '';
});

describe('Guest checkout OTP contract', () => {
  it('keeps the one-time otpProof returned by verify-otp', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: true,
        verified: true,
        message: 'Xác thực email thành công.',
        otpProof: OTP_PROOF,
        otpProofExpiresAt: '2027-05-01T02:05:00.000Z',
      }),
    );

    const result = await verifyGuestBookingOtp('guest@example.com', '123456');

    expect(result.otpProof).toBe(OTP_PROOF);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetch.mock.calls[0])).toEqual({
      email: 'guest@example.com',
      code: '123456',
    });
  });

  it('rejects a verify-otp response without otpProof instead of calling create', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ success: true, verified: true, message: 'ok' }),
      );

    await expect(
      verifyGuestBookingOtp('guest@example.com', '123456'),
    ).rejects.toThrow('Máy chủ không trả mã xác thực email hợp lệ');
  });

  it('sends otpProof, checkoutIntentId and recoverySecret to create guest booking', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ success: true, data: CHECKOUT_RESPONSE }, 201),
      );

    const result = await createGuestBooking({
      courtId: '3f2a6b3e-7f6f-4f5a-9d1a-1f0d5b7c9e11',
      startsAt: '2027-05-01T01:00:00.000Z',
      endsAt: '2027-05-01T02:00:00.000Z',
      customerName: 'Nguyen Van A',
      customerPhone: '0912345678',
      customerEmail: 'guest@example.com',
      idempotencyKey: 'idem-key-1234567890',
      otpProof: OTP_PROOF,
      checkoutIntentId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      recoverySecret: 'b'.repeat(64),
    });

    expect(bodyOf(fetch.mock.calls[0])).toMatchObject({
      otpProof: OTP_PROOF,
      checkoutIntentId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      recoverySecret: 'b'.repeat(64),
      prepaymentPercent: 30,
    });
    expect(result.checkoutToken).toBe('checkout-token');
  });

  it('creates UUID intent ids and persists identity by booking for recovery', () => {
    const identity = createGuestCheckoutIdentity();

    expect(identity.checkoutIntentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(identity.recoverySecret).toHaveLength(64);
    expect(readGuestCheckoutIdentityByBooking('unknown-booking')).toBeNull();

    saveGuestCheckoutIdentity({ ...identity, bookingId: 'booking-1' });
    expect(readGuestCheckoutIdentityByBooking('booking-1')).toEqual({
      ...identity,
      bookingId: 'booking-1',
    });
  });

  it('wires the verify-otp proof and persisted identity into the guest modal', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url = requestUrl(input);
        if (url.endsWith('/api/guest/bookings/send-otp')) {
          return jsonResponse({ success: true, message: 'đã gửi' });
        }
        if (url.endsWith('/api/guest/bookings/verify-otp')) {
          return jsonResponse({
            success: true,
            verified: true,
            message: 'ok',
            otpProof: OTP_PROOF,
            otpProofExpiresAt: '2027-05-01T02:05:00.000Z',
          });
        }
        if (url.endsWith('/api/guest/bookings')) {
          return jsonResponse({ success: true, data: CHECKOUT_RESPONSE }, 201);
        }
        throw new Error(`Unexpected request: ${url}`);
      });

    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);
    const onCreated = jest.fn();

    act(() => {
      root.render(
        <GuestBookingModal
          isOpen={true}
          onClose={jest.fn()}
          courtId="3f2a6b3e-7f6f-4f5a-9d1a-1f0d5b7c9e11"
          courtName="Sân VIP 1"
          timezone="Asia/Ho_Chi_Minh"
          preselectedWindow={{
            start: '2026-11-15T08:00',
            end: '2026-11-15T09:00',
          }}
          onCreated={onCreated}
        />,
      );
    });

    await act(async () => {
      setInputValue(
        container.querySelector('input[name="customerName"]')!,
        'Nguyen Van A',
      );
      setInputValue(
        container.querySelector('input[name="customerPhone"]')!,
        '0912345678',
      );
      setInputValue(
        container.querySelector('input[name="customerEmail"]')!,
        'guest@example.com',
      );
      (
        container.querySelector(
          '.guest-terms-wrapper input[type="checkbox"]',
        ) as HTMLInputElement
      ).click();
    });

    await act(async () => {
      container
        .querySelector('form')
        ?.dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true }),
        );
    });

    const otpInputs = container.querySelectorAll('.guest-otp-digit');
    expect(otpInputs.length).toBe(6);

    for (const [index, input] of Array.from(otpInputs).entries()) {
      await act(async () => {
        setInputValue(input, String(index + 1));
      });
    }

    const createCall = fetch.mock.calls.find(([input]) =>
      requestUrl(input).endsWith('/api/guest/bookings'),
    );
    const verifyCall = fetch.mock.calls.find(([input]) =>
      requestUrl(input).endsWith('/api/guest/bookings/verify-otp'),
    );
    expect(verifyCall).toBeDefined();
    expect(createCall).toBeDefined();
    if (!createCall || !verifyCall) throw new Error('Missing guest request');

    const createBody = bodyOf(createCall);
    const verifyBody = bodyOf(verifyCall);
    expect(verifyBody).toEqual({ email: 'guest@example.com', code: '123456' });
    expect(createBody.otpProof).toBe(OTP_PROOF);
    expect(createBody.checkoutIntentId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(createBody.recoverySecret).toHaveLength(64);

    expect(
      readGuestCheckoutIdentityByBooking(CHECKOUT_RESPONSE.bookingId),
    ).toMatchObject({
      checkoutIntentId: createBody.checkoutIntentId,
      recoverySecret: createBody.recoverySecret,
      bookingId: CHECKOUT_RESPONSE.bookingId,
    });
    expect(onCreated).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    container.remove();
  });
});

describe('Guest checkout token persistence (P2-3)', () => {
  it('không ghi đè token đã lưu khi replay trả accessToken rỗng', () => {
    dom.window.sessionStorage.setItem(
      'guest-manage-token:booking-1',
      'old-token',
    );

    saveGuestManageToken('booking-1', '');
    expect(
      dom.window.sessionStorage.getItem('guest-manage-token:booking-1'),
    ).toBe('old-token');

    saveGuestManageToken('booking-1', 'new-token');
    expect(
      dom.window.sessionStorage.getItem('guest-manage-token:booking-1'),
    ).toBe('new-token');
  });

  it('giữ accessToken pending cũ khi replay cùng booking trả rỗng', () => {
    expect(
      resolvePendingGuestAccessToken(
        { bookingId: 'booking-1', accessToken: 'old-token' },
        { bookingId: 'booking-1', accessToken: '' },
      ),
    ).toBe('old-token');

    // Booking khác thì không mang token của đơn trước sang.
    expect(
      resolvePendingGuestAccessToken(
        { bookingId: 'booking-1', accessToken: 'old-token' },
        { bookingId: 'booking-2', accessToken: '' },
      ),
    ).toBeUndefined();

    expect(
      resolvePendingGuestAccessToken(null, {
        bookingId: 'booking-1',
        accessToken: 'new-token',
      }),
    ).toBe('new-token');
  });
});
