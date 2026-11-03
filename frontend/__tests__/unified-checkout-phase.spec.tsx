import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import React from 'react';
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
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

for (const storeName of ['localStorage', 'sessionStorage'] as const) {
  if (!(globalThis as any)[storeName]) {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, storeName, {
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => void store.set(k, String(v)),
        removeItem: (k: string) => void store.delete(k),
        clear: () => {
          store.clear();
        },
      },
      configurable: true,
    });
  }
}

// STEP4-P1-1: chỉ stub pha QR để assertions tập trung vào đường form thật.
// Form khách (GuestBookingModal) dùng hàng thật với fetch giả lập.
jest.unstable_mockModule(
  '../features/payment/components/booking-qr-modal.js',
  () => ({
    BookingQrModal: (props: {
      isOpen: boolean;
      bookingId: string;
      bookingCode: string;
      onCancel?: () => Promise<void> | void;
      onClose?: () => void;
    }) => {
      if (!props.isOpen) return null;
      return (
        <div data-testid="stub-qr" role="dialog" aria-modal="true">
          <span>{props.bookingCode}</span>
          <button
            type="button"
            data-testid="stub-qr-close"
            onClick={props.onClose}
          >
            Đóng
          </button>
        </div>
      );
    },
  }),
);

const { createRoot } = await import('react-dom/client');
const { UnifiedCheckoutDialog } =
  await import('../features/payment/components/unified-checkout-dialog.js');
const { getPendingBooking, clearPendingBooking } =
  await import('../features/booking/components/pending-booking-alert.js');

const mountedRoots: Array<() => void> = [];

function mount(node: React.ReactElement) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  const unmount = () => {
    try {
      act(() => root.unmount());
    } finally {
      container.remove();
    }
  };
  mountedRoots.push(unmount);
  act(() => {
    root.render(node);
  });
  return {
    container,
    unmount: () => {
      const index = mountedRoots.indexOf(unmount);
      if (index >= 0) mountedRoots.splice(index, 1);
      unmount();
    },
  };
}

function setInput(el: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  );
  act(() => {
    descriptor?.set?.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}

function click(el: Element | null) {
  if (!el) throw new Error('Không tìm thấy nút bấm trong test.');
  act(() => {
    (el as HTMLElement).dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true }),
    );
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Bước 4 — Dialog hợp nhất đi hết OTP tới QR trong một vòng đời (STEP4-P1-1)', () => {
  beforeEach(() => {
    clearPendingBooking();
    try {
      (globalThis as any).sessionStorage.clear();
    } catch {}
    delete (globalThis as any).fetch;
  });

  afterEach(() => {
    while (mountedRoots.length > 0) mountedRoots.pop()!();
  });

  it('Hoàn tất OTP/hold với form thật không đóng dialog, chuyển pha sang QR, lưu pending', async () => {
    const fetchCalls: Array<{ url: string; method: string }> = [];
    (globalThis as any).fetch = jest.fn(
      (url: string, init?: { method?: string; body?: string }) => {
        const method = init?.method ?? 'GET';
        fetchCalls.push({ url: String(url), method });
        let data: unknown = {};
        const text = String(url);
        if (text.includes('send-otp')) data = {};
        else if (text.includes('verify-otp')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                success: true,
                message: 'ok',
                otpProof: 'proof-1',
                otpProofExpiresAt: new Date(Date.now() + 600000).toISOString(),
              }),
              {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              },
            ),
          );
        } else if (text.endsWith('/api/guest/bookings'))
          data = {
            bookingId: 'bk-phase-1',
            bookingCode: 'BK-PHASE1',
            holdExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            totalAmount: 300000,
            prepaymentAmount: 90000,
            accessToken: 'manage-1',
            accessTokenExpiresAt: new Date(
              Date.now() + 30 * 86400 * 1000,
            ).toISOString(),
            checkoutToken: 'checkout-1',
            checkoutTokenExpiresAt: new Date(
              Date.now() + 10 * 60 * 1000,
            ).toISOString(),
            checkoutIntentId: 'intent-1',
            serverNow: new Date().toISOString(),
          };
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, message: 'ok', data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      },
    );

    const onClose = jest.fn();
    const onCancelHold = jest.fn();
    const onHoldCreated = jest.fn();
    // Khung giờ test phải luôn ở tương lai so với giờ chạy, kẻo
    // assertBookableWindow chặn submit ở validateForm (chưa kiểm chứng).
    const futureDay = new Date(Date.now() + 3 * 86400 * 1000);
    const day = futureDay.toISOString().slice(0, 10);
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <UnifiedCheckoutDialog
          isOpen={open}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          courtId="court-1"
          courtName="Sân 1"
          courtCode="C1"
          window={{ start: `${day}T09:00`, end: `${day}T10:00` }}
          onCancelHold={onCancelHold}
          onHoldCreated={(hold) => {
            onHoldCreated(hold);
          }}
        />
      );
    }
    const mounted = mount(<Harness />);
    try {
      expect(
        mounted.container.querySelector('input[name="customerName"]'),
      ).not.toBeNull();

      setInput(
        mounted.container.querySelector(
          'input[name="customerName"]',
        ) as HTMLInputElement,
        'Nguyễn Văn A',
      );
      setInput(
        mounted.container.querySelector(
          'input[name="customerPhone"]',
        ) as HTMLInputElement,
        '0912345678',
      );
      setInput(
        mounted.container.querySelector(
          'input[name="customerEmail"]',
        ) as HTMLInputElement,
        'a@example.com',
      );
      click(mounted.container.querySelector('input[type="checkbox"]'));
      await flush();
      const form = mounted.container.querySelector(
        'form.guest-modal-form',
      ) as HTMLFormElement;
      act(() => {
        form.dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true }),
        );
      });
      await flush();

      // Đã sang bước OTP 6 số.
      const digits = mounted.container.querySelectorAll('.guest-otp-digit');
      expect(digits.length).toBe(6);
      for (let i = 0; i < 6; i += 1) {
        setInput(digits[i] as HTMLInputElement, String(i + 1));
        await flush();
      }

      // Tạo hold xong: KHÔNG có sự kiện đóng, đã sang pha QR, pending đã lưu.
      expect(onClose).not.toHaveBeenCalled();
      expect(onHoldCreated).toHaveBeenCalledTimes(1);
      const qr = mounted.container.querySelector('[data-testid="stub-qr"]');
      expect(qr).not.toBeNull();
      expect(qr!.textContent).toContain('BK-PHASE1');
      expect(getPendingBooking()?.bookingId).toBe('bk-phase-1');

      // Đóng từ pha QR chỉ ẩn dialog, không hủy ngầm.
      click(mounted.container.querySelector('[data-testid="stub-qr-close"]'));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onCancelHold).not.toHaveBeenCalled();
      expect(
        fetchCalls.filter(({ url }) => url.includes('cancel-hold')),
      ).toHaveLength(0);
      expect(
        mounted.container.querySelector('[data-testid="stub-qr"]'),
      ).toBeNull();
      expect(getPendingBooking()?.bookingId).toBe('bk-phase-1');
    } finally {
      mounted.unmount();
    }
  });
});
