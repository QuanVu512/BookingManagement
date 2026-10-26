import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { CancelPaidBooking } from '../features/booking/components/cancel-paid-booking.js';
import type { BookingRecord } from '../features/booking/model/booking.js';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14004',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { createRoot } = await import('react-dom/client');

const booking = {
  id: 'booking-1',
  bookingCode: 'BK-1',
  courtId: 'court-1',
  courtName: 'Court 1',
  timezone: 'Asia/Ho_Chi_Minh',
  startsAt: '2035-01-08T01:00:00Z',
  endsAt: '2035-01-08T02:00:00Z',
  holdExpiresAt: '2035-01-08T01:00:00Z',
  status: 'CONFIRMED',
  totalAmount: 1_000_000,
  currency: 'VND',
  priceItems: [],
} as BookingRecord;

const quote = {
  success: true,
  data: {
    quoteId: 'quote-1',
    bookingId: 'booking-1',
    bookingVersion: 2,
    status: 'QUOTED',
    totalAmount: 1_000_000,
    paidAmount: 1_000_000,
    penaltyAmount: 100_000,
    refundAmount: 900_000,
    currency: 'VND',
    policyVersion: 'cancel-v1.0',
    policyText: 'Hủy đơn BK-1: phí 100.000đ, hoàn 900.000đ.',
    expiresAt: '2026-10-23T00:10:00Z',
    replayed: false,
  },
};

const applied = {
  success: true,
  data: {
    bookingId: 'booking-1',
    bookingCode: 'BK-1',
    status: 'CANCELLED',
    penaltyAmount: 100_000,
    totalRefund: 900_000,
    refundRequestIds: ['refund-1'],
    replayed: false,
  },
};

function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onDone = jest.fn();
  act(() => {
    root.render(
      <CancelPaidBooking booking={booking} disabled={false} onDone={onDone} />,
    );
  });
  return { container, root, onDone };
}

function clickByText(container: Element, text: string): void {
  const button = [...container.querySelectorAll('button')].find((node) =>
    (node.textContent ?? '').includes(text),
  );
  if (!button) throw new Error(`Missing button ${text}`);
  act(() => {
    button.click();
  });
}

// Không có @testing-library: chờ điều kiện UI quan sát được bằng polling
// trong async act, thay vì đếm microtask cố định.
async function waitForText(
  container: Element,
  text: string,
  timeoutMs = 5000,
): Promise<void> {
  const startedAt = Date.now();
  for (;;) {
    let found = false;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      found = (container.textContent ?? '').includes(text);
    });
    if (found) return;
    if (Date.now() - startedAt > timeoutMs)
      throw new Error(`Timed out waiting for text: ${text}`);
  }
}

describe('CancelPaidBooking (C08)', () => {
  it('quote → unchecked consent blocks apply → checked consent applies → done reloads', async () => {
    const calls: string[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input.url;
      calls.push(url);
      if (url.endsWith('/api/auth/csrf'))
        return new Response(
          JSON.stringify({ success: true, data: { token: 'a'.repeat(64) } }),
        );
      if (url.endsWith('/cancel-quote'))
        return new Response(JSON.stringify(quote));
      if (url.endsWith('/cancel-apply')) {
        const body = await (input as Request).json?.().catch(() => null);
        void body;
        return new Response(JSON.stringify(applied));
      }
      return new Response('{}', { status: 404 });
    });
    const { container, root, onDone } = render();
    clickByText(container, 'Yêu cầu hủy sân');
    await waitForText(document.body, '900.000');
    expect(document.body.textContent).toContain('900.000');
    const applyButton = [...document.body.querySelectorAll('button')].find((node) =>
      (node.textContent ?? '').includes('Đồng ý hủy'),
    );
    expect(applyButton?.hasAttribute('disabled')).toBe(true);
    const checkbox = document.body.querySelector('input[type="checkbox"]');
    if (!(checkbox instanceof dom.window.HTMLInputElement))
      throw new Error('Missing consent checkbox');
    act(() => {
      checkbox.click();
    });
    expect(applyButton?.hasAttribute('disabled')).toBe(false);
    clickByText(document.body, 'Đồng ý hủy');
    await waitForText(document.body, 'Đã hủy đơn BK-1');
    expect(document.body.textContent).toContain('Đã hủy đơn BK-1');
    expect(onDone).not.toHaveBeenCalled();
    clickByText(document.body, 'Xong');
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(calls.some((url) => url.endsWith('/cancel-quote'))).toBe(true);
    expect(calls.some((url) => url.endsWith('/cancel-apply'))).toBe(true);
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  it('renders nothing for non-CONFIRMED bookings', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CancelPaidBooking
          booking={{ ...booking, status: 'HOLDING' }}
          disabled={false}
          onDone={() => undefined}
        />,
      );
    });
    expect(container.textContent).toBe('');
    act(() => root.unmount());
    container.remove();
  });
});
