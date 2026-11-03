import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import React from 'react';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://127.0.0.1:4001',
});

(dom.window as any).requestIdleCallback =
  (dom.window as any).requestIdleCallback || ((cb: () => void) => setTimeout(() => cb(), 1));
(dom.window as any).cancelIdleCallback =
  (dom.window as any).cancelIdleCallback || ((id: any) => clearTimeout(id));

for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  requestIdleCallback: (dom.window as any).requestIdleCallback,
  cancelIdleCallback: (dom.window as any).cancelIdleCallback,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

if (!(globalThis as any).localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
    configurable: true,
  });
}

const { createRoot } = await import('react-dom/client');
const { usePaymentCountdown } = await import(
  '../features/payment/hooks/use-payment-countdown.js'
);
const {
  PendingBookingAlert,
  savePendingBooking,
  getPendingBooking,
  clearPendingBooking,
} = await import('../features/booking/components/pending-booking-alert.js');
type PendingBookingState = import(
  '../features/booking/components/pending-booking-alert.js'
).PendingBookingState;
const { UnifiedCheckoutDialog } = await import(
  '../features/payment/components/unified-checkout-dialog.js'
);
const { BookingOrderSummary } = await import(
  '../features/booking/components/booking-order-summary.js'
);

function mount(node: React.ReactElement) {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function futureIso(msFromNow: number): string {
  return new Date(Date.now() + msFromNow).toISOString();
}

function basePending(overrides: Partial<PendingBookingState> = {}): PendingBookingState {
  return {
    bookingId: 'bk-probe-4',
    bookingCode: 'BK-PROBE4',
    courtId: 'court-1',
    courtName: 'Sân 1',
    startsAt: '2026-11-02T09:00:00.000Z',
    endsAt: '2026-11-02T10:00:00.000Z',
    prepaymentAmount: 90000,
    holdExpiresAt: futureIso(4 * 60 * 1000),
    type: 'guest',
    ...overrides,
  };
}

function bookingDay(offsetDays: number): string {
  // Fixture luôn ở tương lai so với giờ chạy, kẻo isWindowInPast khóa nút bấm.
  return new Date(Date.now() + offsetDays * 86400 * 1000).toISOString().slice(0, 10);
}

function baseSummaryProps(overrides: Record<string, unknown> = {}) {
  const day = bookingDay(3);
  return {
    state: {
      window: { start: `${day}T09:00`, end: `${day}T10:00` },
      busy: false,
      error: '',
      quote: {
        available: true as const,
        reason: null,
        totalAmount: 300000,
        currency: 'VND',
        cleanupMinutes: 0,
        timezone: 'Asia/Ho_Chi_Minh',
        serverNow: new Date().toISOString(),
        occupiedUntil: `${bookingDay(3)}T10:00:00.000Z`,
        priceItems: [],
      },
      booking: undefined,
      canRetry: false,
    },
    timezone: 'Asia/Ho_Chi_Minh',
    authenticated: false,
    showSignIn: false,
    signInLabel: '',
    onChangeWindow: jest.fn(),
    onQuote: jest.fn(),
    onCreate: jest.fn(),
    onSignIn: jest.fn(),
    courtName: 'Sân 1',
    courtCode: 'C1',
    products: [],
    ...overrides,
  } as unknown as React.ComponentProps<typeof BookingOrderSummary>;
}

describe('Bước 4 — Hộp thoại hợp nhất và xử lý khách/thành viên (AC-23/24/25, R1/R4)', () => {
  beforeEach(() => {
    clearPendingBooking();
    jest.restoreAllMocks();
  });

  it('PROBE-4 (Sửa countdown): frame render đầu tiên còn hạn 4 phút không bật expired và remainingMs khác 0', () => {
    let observed: { remainingMs: number; expired: boolean } | null = null;
    function Probe() {
      observed = usePaymentCountdown({
        expiresAt: futureIso(4 * 60 * 1000),
        serverNow: new Date().toISOString(),
      });
      return null;
    }
    const mounted = mount(<Probe />);
    expect(observed).not.toBeNull();
    expect(observed!.expired).toBe(false);
    expect(observed!.remainingMs).toBeGreaterThan(200 * 1000);
    mounted.unmount();
  });

  it('PROBE-4 (Toàn vẹn storage): mount cảnh báo còn hạn không xóa localStorage', () => {
    const pending = basePending();
    savePendingBooking(pending);
    const onResume = jest.fn();
    const onCancel = jest.fn();
    const mounted = mount(
      <PendingBookingAlert pending={pending} onResume={onResume} onCancel={onCancel} />,
    );
    expect(getPendingBooking()?.bookingId).toBe('bk-probe-4');
    expect(mounted.container.textContent).toContain('BK-PROBE4');
    mounted.unmount();
  });

  it('PROBE-4 (Hủy lỗi mạng): giữ cảnh báo, báo role=alert, không xóa storage', () => {
    const pending = basePending();
    savePendingBooking(pending);
    const onCancel = jest.fn<() => Promise<void>>().mockRejectedValue(new Error('mất mạng'));
    const mounted = mount(
      <PendingBookingAlert pending={pending} onResume={jest.fn()} onCancel={onCancel} />,
    );
    const buttons = Array.from(mounted.container.querySelectorAll('button'));
    const cancelBtn = buttons.find((b) => b.textContent?.includes('Hủy đơn này'));
    expect(cancelBtn).toBeDefined();
    act(() => {
      cancelBtn!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    const confirmBtn = Array.from(mounted.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Xác nhận hủy'),
    );
    expect(confirmBtn).toBeDefined();
    act(() => {
      confirmBtn!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    // Đợi promise hủy thất bại rồi kiểm tra cảnh báo còn nguyên.
    return act(async () => {
      await Promise.resolve();
      expect(mounted.container.querySelector('[role="alert"]')).not.toBeNull();
      expect(mounted.container.textContent).toContain('BK-PROBE4');
      expect(getPendingBooking()?.bookingId).toBe('bk-probe-4');
      mounted.unmount();
    });
  });

  it('PROBE-6/R1 (Hết giờ client): giữ bản ghi, hiện nút đọc lại, không tự xóa', () => {
    const pending = basePending({
      bookingId: 'bk-expired-client',
      bookingCode: 'BK-EXPCLI',
      holdExpiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    savePendingBooking(pending);
    const onResume = jest.fn();
    const mounted = mount(
      <PendingBookingAlert pending={pending} onResume={onResume} onCancel={jest.fn()} />,
    );
    // Không tự xóa theo giờ máy client (R4) và không khẳng định slot giải phóng (R1).
    expect(getPendingBooking()?.bookingId).toBe('bk-expired-client');
    expect(mounted.container.textContent).not.toContain('đã được tự động giải phóng');
    expect(mounted.container.textContent).toContain('Đọc lại trạng thái đơn');
    const reloadBtn = Array.from(mounted.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Đọc lại trạng thái'),
    );
    act(() => {
      reloadBtn!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(onResume).toHaveBeenCalledTimes(1);
    mounted.unmount();
  });

  it('PROBE-1/AC-23 (Phiên chưa xác định): nút thử lại phiên, không gọi onGuestBook', () => {
    const onGuestBook = jest.fn();
    const onRetrySession = jest.fn();
    const mounted = mount(
      <BookingOrderSummary
        {...baseSummaryProps({
          authenticated: false,
          sessionStatus: 'unknown',
          sessionLoading: false,
          onRetrySession,
          onGuestBook,
        })}
      />,
    );
    expect(mounted.container.textContent).toContain('Không thể kiểm tra phiên đăng nhập');
    expect(mounted.container.querySelector('input[name="customerName"]')).toBeNull();
    const cta = mounted.container.querySelector('.btn.btn-primary') as HTMLButtonElement;
    act(() => {
      cta.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    expect(onRetrySession).toHaveBeenCalledTimes(1);
    expect(onGuestBook).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('PROBE-3/AC-25 (Thành viên): bấm đặt sân đi thẳng onCreate, không form khách, không OTP', () => {
    const onCreate = jest.fn();
    const onGuestBook = jest.fn();
    const mounted = mount(
      <BookingOrderSummary
        {...baseSummaryProps({
          authenticated: true,
          sessionStatus: 'authenticated',
          sessionLoading: false,
          onCreate,
          onGuestBook,
        })}
      />,
    );
    expect(mounted.container.querySelector('input[name="customerName"]')).toBeNull();
    expect(mounted.container.querySelector('input[name="customerPhone"]')).toBeNull();
    // Đồng ý điều khoản rồi gửi form đặt sân của thành viên.
    const checkbox = mounted.container.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    act(() => {
      checkbox!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    const form = mounted.container.querySelector('form') as HTMLFormElement;
    expect(form).not.toBeNull();
    act(() => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    // Đi thẳng luồng hội viên: gọi onCreate, tuyệt đối không mở form khách/OTP.
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onGuestBook).not.toHaveBeenCalled();
    mounted.unmount();
  });

  it('PROBE-2/AC-24 (ESC + focus): đóng dialog chỉ ẩn, không hủy ngầm, trả focus về nút bấm', () => {
    const fetchSpy = jest.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    (globalThis as any).fetch = fetchSpy;
    const onCancelHold = jest.fn();
    const trigger = dom.window.document.createElement('button');
    trigger.textContent = 'Đặt sân ngoài trang';
    dom.window.document.body.appendChild(trigger);
    trigger.focus();
    const triggerRef = { current: trigger };
    const pending = basePending({ bookingId: 'bk-esc', bookingCode: 'BK-ESC' });
    savePendingBooking(pending);
    const day = bookingDay(3);

    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <>
          <PendingBookingAlert
            pending={pending}
            onResume={jest.fn()}
            onCancel={jest.fn()}
          />
          <UnifiedCheckoutDialog
            isOpen={open}
            onClose={() => setOpen(false)}
            courtId="court-1"
            courtName="Sân 1"
            courtCode="C1"
            window={{ start: `${day}T09:00`, end: `${day}T10:00` }}
            onCancelHold={onCancelHold}
            triggerRef={triggerRef as React.RefObject<HTMLElement | null>}
          />
        </>
      );
    }
    const mounted = mount(<Harness />);
    expect(mounted.container.querySelector('[role="dialog"]')).not.toBeNull();
    const dialogsBefore = mounted.container.querySelectorAll('[role="dialog"]').length;
    expect(dialogsBefore).toBeGreaterThanOrEqual(1);
    act(() => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    // ESC chỉ ẩn dialog hợp nhất (cảnh báo đơn vẫn còn), tuyệt đối không POST hủy.
    expect(mounted.container.querySelector('[data-testid="stub-qr"]')).toBeNull();
    expect(mounted.container.textContent).toContain('BK-ESC');
    expect(onCancelHold).not.toHaveBeenCalled();
    expect(
      fetchSpy.mock.calls.filter(([url]: [unknown]) => String(url).includes('cancel-hold')),
    ).toHaveLength(0);
    // Tiêu điểm trả về đúng nút đã bấm ngoài trang chính.
    expect(dom.window.document.activeElement).toBe(trigger);
    mounted.unmount();
    trigger.remove();
    delete (globalThis as any).fetch;
  });

  it('PROBE-7/STEP4-P2-1 (Đổi đơn hết giờ sang còn hạn): frame đầu đơn mới không expired', () => {
    const records: Array<{ expiry: string | null; expired: boolean; remainingMs: number }> = [];
    const expiredA = new Date(Date.now() - 1000).toISOString();
    const futureB = futureIso(4 * 60 * 1000);
    function Probe({ expiry }: { expiry: string }) {
      const state = usePaymentCountdown({ expiresAt: expiry, serverNow: null });
      records.push({ expiry, expired: state.expired, remainingMs: state.remainingMs });
      return null;
    }
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(<Probe expiry={expiredA} />);
    });
    const switchIndex = records.length;
    act(() => {
      root.render(<Probe expiry={futureB} />);
    });
    // Frame render đầu tiên sau khi đổi sang đơn B còn hạn phải đúng ngay,
    // không kẹt expired=true của đơn A cũ.
    expect(records.length).toBeGreaterThan(switchIndex);
    expect(records[switchIndex].expiry).toBe(futureB);
    expect(records[switchIndex].expired).toBe(false);
    expect(records[switchIndex].remainingMs).toBeGreaterThan(0);
    act(() => root.unmount());
    container.remove();
  });
});
