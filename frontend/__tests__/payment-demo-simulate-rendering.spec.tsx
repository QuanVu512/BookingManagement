import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14003',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { createRoot } = await import('react-dom/client');

process.env.NEXT_PUBLIC_API_URL = 'http://127.0.0.1:4000';
process.env.NEXT_PUBLIC_PAYMENT_SIMULATION_ENABLED = 'true';
const { BookingPaymentCheckout } =
  await import('../features/payment/components/payment-status-panel.js');

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

const now = new Date().toISOString();
const expiresAt = new Date(Date.now() + 300000).toISOString();
const request = {
  id: 'req-demo-1',
  paymentCode: 'PAY-DEMO12345678',
  purpose: 'PREPAYMENT' as const,
  amount: 45000,
  currency: 'VND',
  method: 'PAYOS_TRANSFER' as const,
  providerOrderCode: '1000001',
  checkoutUrl: 'http://localhost:4001/payment/result?code=PAY-DEMO12345678',
  status: 'PENDING' as const,
  expiresAt,
  reviewRequired: false,
  reviewReasonCode: null,
};
const booking = {
  id: 'booking-demo-1',
  bookingCode: 'BK-DEMO',
  courtId: 'court',
  courtName: 'Court',
  timezone: 'Asia/Ho_Chi_Minh',
  startsAt: now,
  endsAt: expiresAt,
  holdExpiresAt: expiresAt,
  status: 'HOLDING' as const,
  totalAmount: 150000,
  currency: 'VND',
  priceItems: [],
};

function mockFetch(calls: string[], failSimulation = false) {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async (url, options) => {
      const path =
        typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      calls.push(`${options?.method ?? 'GET'} ${path}`);
      if (path.endsWith('/auth/csrf'))
        return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
      if (path.endsWith('/simulate') && failSimulation)
        return new Response(JSON.stringify({ message: 'Demo unavailable' }), {
          status: 503,
        });
      if (path.endsWith('/simulate'))
        return new Response(
          JSON.stringify({
            success: true,
            data: { eventId: 'event-1', status: 'processed', outcome: null },
          }),
        );
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
                requiredPrepaymentAmount: 45000,
                serverNow: now,
              }
            : request,
        }),
      );
    });
}

describe('Khu vực giả lập thanh toán DemoSimulateSection (FE-PAY-DEMO: chế độ chạy thử nghiệm)', () => {
  it('FE-PAY-DEMO (Banner và nút giả lập): hiển thị thông báo chế độ Showcase và nút giả lập khi cờ bật và đang chờ thanh toán', async () => {
    const calls: string[] = [];
    const fetch = mockFetch(calls);
    const { container, root } = render(
      <BookingPaymentCheckout booking={booking} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(container.textContent).toContain('Chế độ Showcase');
      const button = [...container.querySelectorAll('button')].find((element) =>
        element.textContent?.includes('Giả lập thanh toán thành công'),
      );
      expect(button).toBeDefined();
      expect(button?.disabled).toBe(false);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });

  it('FE-PAY-DEMO (Kích hoạt giả lập): khi nhấn nút giả lập, gửi yêu cầu tới máy chủ (/simulate) và tự động đọc lại kết quả thanh toán mới nhất', async () => {
    const calls: string[] = [];
    const fetch = mockFetch(calls);
    const { container, root } = render(
      <BookingPaymentCheckout booking={booking} />,
    );
    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const button = [...container.querySelectorAll('button')].find((element) =>
        element.textContent?.includes('Giả lập thanh toán thành công'),
      );
      expect(button).toBeDefined();
      await act(async () => {
        button?.click();
        button?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      expect(
        calls.some((call) => call.includes('/webhooks/payos/simulate')),
      ).toBe(true);
      expect(
        calls.filter((call) => call.includes('/webhooks/payos/simulate')),
      ).toHaveLength(1);
      const posted = fetch.mock.calls.find(([url]) => {
        const path =
          typeof url === 'string'
            ? url
            : url instanceof URL
              ? url.href
              : url.url;
        return path.endsWith('/simulate');
      });
      const body = posted?.[1]?.body;
      if (typeof body !== 'string')
        throw new Error('Expected a JSON request body.');
      expect(JSON.parse(body)).toEqual({
        orderCode: 1000001,
      });
      expect(
        calls.filter(
          (call) =>
            call.startsWith('POST ') &&
            !call.includes('/simulate') &&
            !call.includes('/csrf'),
        ),
      ).toHaveLength(1);
      expect(
        calls.filter((call) => call.includes('/status')).length,
      ).toBeGreaterThan(0);
    } finally {
      act(() => root.unmount());
      container.remove();
      fetch.mockRestore();
    }
  });
});

it('shows simulation in the unified checkout QR phase', async () => {
  const { BookingQrModal } =
    await import('../features/payment/components/booking-qr-modal.js');
  const calls: string[] = [];
  const fetch = mockFetch(calls);
  const { container, root } = render(
    <BookingQrModal
      isOpen
      bookingId={booking.id}
      bookingCode={booking.bookingCode}
      prepaymentAmount={45000}
    />,
  );
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).toContain('Giả lập thanh toán thành công');
    expect(container.textContent).toContain('Không chuyển tiền thật');
  } finally {
    act(() => root.unmount());
    container.remove();
    fetch.mockRestore();
  }
});

it('shows a server error without declaring payment success', async () => {
  const calls: string[] = [];
  const fetch = mockFetch(calls, true);
  const { container, root } = render(
    <BookingPaymentCheckout booking={booking} />,
  );
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    const button = [...container.querySelectorAll('button')].find((element) =>
      element.textContent?.includes('Giả lập thanh toán thành công'),
    );
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(container.textContent).toContain('Demo unavailable');
    expect(container.textContent).not.toContain('Đặt sân thành công');
    expect(button?.disabled).toBe(false);
  } finally {
    act(() => root.unmount());
    container.remove();
    fetch.mockRestore();
  }
});
