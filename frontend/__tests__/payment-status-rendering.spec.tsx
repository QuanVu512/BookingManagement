import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import QRCode from 'qrcode';
import {
  BookingPaymentCheckout,
  PaymentStatusPanel,
} from '../features/payment/components/payment-status-panel.js';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14002',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { createRoot } = await import('react-dom/client');

const baseRequest = {
  id: 'req-1',
  paymentCode: 'PAY-ABC123',
  purpose: 'PREPAYMENT' as const,
  amount: 45000,
  currency: 'VND',
  method: 'PAYOS_TRANSFER' as const,
  providerOrderCode: null,
  checkoutUrl: 'https://pay.payos.vn/web/abc',
  status: 'PENDING' as const,
  expiresAt: null,
  reviewRequired: false,
  reviewReasonCode: null,
};

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe('PaymentStatusPanel states (FE-PAY-05/06, MIG-14/MIG-17)', () => {
  it('renders success only for server SCR04 + CONFIRMED', () => {
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={{
          screen: 'SCR04_SUCCESS',
          reviewRequired: false,
          reviewReasonCode: null,
          bookingStatus: 'CONFIRMED',
          netCredited: 45000,
          requiredPrepaymentAmount: 45000,
        }}
        serverNow={null}
        supportPhone={null}
        onRefresh={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toContain('Đặt sân thành công');
    expect(container.textContent).not.toContain('chưa bị trừ tiền');
    act(() => root.unmount());
    container.remove();
  });

  it('renders honest expiry copy without money claims', () => {
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={{
          screen: 'SCR05_EXPIRED',
          reviewRequired: false,
          reviewReasonCode: null,
          bookingStatus: 'EXPIRED',
          netCredited: 0,
          requiredPrepaymentAmount: 45000,
        }}
        serverNow={null}
        supportPhone={null}
        onRefresh={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toContain('Giữ chỗ đã hết hạn');
    expect(container.textContent).not.toContain('đảm bảo');
    act(() => root.unmount());
    container.remove();
  });

  it('renders review state with evidence copy and support code', () => {
    const onRefresh = jest.fn();
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={{
          screen: 'SCR06_REVIEW',
          reviewRequired: true,
          reviewReasonCode: 'LATE_PAYMENT_REVIEW',
          bookingStatus: 'EXPIRED',
          netCredited: 45000,
          requiredPrepaymentAmount: 45000,
        }}
        serverNow={null}
        supportPhone={'19000000'}
        onRefresh={onRefresh}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).toContain('cần tra soát');
    expect(container.textContent).toContain('PAY-ABC123');
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    const buttons = [...container.querySelectorAll('button')].map(
      (button) => button.textContent,
    );
    expect(buttons).toContain('Tải lại trạng thái');
    act(() => root.unmount());
    container.remove();
  });

  it('hides support CTA when phone is not configured (MIG-17)', () => {
    const { container, root } = render(
      <PaymentStatusPanel
        request={baseRequest}
        outcome={null}
        serverNow={null}
        supportPhone={null}
        onRefresh={() => {}}
        onRetry={() => {}}
      />,
    );
    expect(container.textContent).not.toContain('tel:');
    act(() => root.unmount());
    container.remove();
  });
});

describe('Booking checkout QR and server deadline', () => {
  it('renders provider QR, counts down, and retries with the same payment key', async () => {
    const keys: string[] = [];
    const qr = jest
      .spyOn(QRCode, 'toCanvas')
      .mockImplementation(async () => undefined);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 300000).toISOString();
    const request = {
      ...baseRequest,
      expiresAt,
      vietQrPayload: 'provider-verified-qr-payload',
    };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url, options) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        if (path.endsWith('/auth/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (options?.method === 'POST') {
          const body: unknown = JSON.parse(
            typeof options.body === 'string' ? options.body : '{}',
          );
          if (
            typeof body === 'object' &&
            body &&
            'idempotencyKey' in body &&
            typeof body.idempotencyKey === 'string'
          )
            keys.push(body.idempotencyKey);
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: path.endsWith('/status')
              ? {
                  screen: 'SCR_PENDING',
                  reviewRequired: false,
                  reviewReasonCode: null,
                  bookingStatus: 'HOLDING',
                  netCredited: 0,
                  requiredPrepaymentAmount: 100000,
                  serverNow: now,
                }
              : request,
          }),
        );
      });
    const booking = {
      id: 'booking-qr',
      bookingCode: 'BK-QR',
      courtId: 'court',
      courtName: 'Court',
      timezone: 'Asia/Ho_Chi_Minh',
      startsAt: now,
      endsAt: expiresAt,
      holdExpiresAt: expiresAt,
      status: 'HOLDING' as const,
      totalAmount: 100000,
      currency: 'VND',
      priceItems: [],
    };
    const { container, root } = render(
      <BookingPaymentCheckout booking={booking} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(
        container.querySelector(
          'canvas[aria-label="Mã QR thanh toán đơn đặt sân"]',
        ),
      ).not.toBeNull();
      expect(qr.mock.calls[0]?.[1]).toBe('provider-verified-qr-payload');
      expect(container.textContent).not.toContain('Đặt sân thành công');
      const before = container.querySelector('[role="timer"]')?.textContent;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1100));
      });
      expect(container.querySelector('[role="timer"]')?.textContent).not.toBe(
        before,
      );
      const beforeRetry =
        container.querySelector('[role="timer"]')?.textContent ?? '';
      await act(async () => container.querySelector('button')?.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
      expect(
        (container.querySelector('[role="timer"]')?.textContent ?? '') <=
          beforeRetry,
      ).toBe(true);
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe(keys[1]);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
      qr.mockRestore();
    }
  });
});
