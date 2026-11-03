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

const { createRoot } = await import('react-dom/client');
const { BookingQrModal } =
  await import('../features/payment/components/booking-qr-modal.js');

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

async function flush(times = 4) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function click(el: Element | null) {
  if (!el) throw new Error('Không tìm thấy nút bấm trong test.');
  act(() => {
    (el as HTMLElement).dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true }),
    );
  });
}

interface FetchCall {
  url: string;
  method: string;
  checkoutToken: string | null;
}

function installFetch(
  recovery: unknown,
  opts?: {
    requestStatus?: string;
    requestPayload?: string | null;
    expiresAt?: string;
  },
) {
  const calls: FetchCall[] = [];
  const defaultExpiresAt =
    opts?.expiresAt ?? new Date(Date.now() + 4 * 60 * 1000).toISOString();
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  (globalThis as any).fetch = jest.fn(
    (
      url: string,
      init?: { method?: string; headers?: Record<string, string> },
    ) => {
      const method = init?.method ?? 'GET';
      const text = String(url);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({
        url: text,
        method,
        checkoutToken: headers['X-Booking-Checkout-Token'] ?? null,
      });
      if (text.includes('/api/auth/csrf')) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: 'a'.repeat(64) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (text.includes('/recovery')) return Promise.resolve(json(recovery));
      if (
        method === 'POST' &&
        (text.endsWith('/api/payments/requests') ||
          text.endsWith('/api/guest/payments/requests'))
      ) {
        // Luồng thường (có ManageToken): giữ nguyên hành vi tạo chuẩn.
        return Promise.resolve(
          json({
            id: 'pr-normal',
            paymentCode: 'BK-R1',
            purpose: 'PREPAYMENT',
            amount: 90000,
            currency: 'VND',
            method: 'PAYOS_TRANSFER',
            providerOrderCode: null,
            checkoutUrl: 'https://pay.example/normal',
            status: 'PENDING',
            expiresAt: defaultExpiresAt,
            vietQrPayload: '000201QR-NORMAL',
            reviewRequired: false,
            reviewReasonCode: null,
          }),
        );
      }
      if (
        method === 'POST' &&
        text.includes('/guest/bookings/') &&
        text.includes('/payment-requests')
      ) {
        // S5-01: tạo mới bằng checkout token trên endpoint riêng của booking.
        return Promise.resolve(
          json({
            id: 'pr-new',
            paymentCode: 'BK-R1',
            purpose: 'PREPAYMENT',
            amount: 90000,
            currency: 'VND',
            method: 'PAYOS_TRANSFER',
            providerOrderCode: null,
            checkoutUrl: 'https://pay.example/x',
            status: 'PENDING',
            expiresAt: defaultExpiresAt,
            vietQrPayload: '000201QR-NEW',
            reviewRequired: false,
            reviewReasonCode: null,
          }),
        );
      }
      if (text.endsWith('/status')) {
        return Promise.resolve(
          json({
            screen: 'SCR_PENDING',
            reviewRequired: false,
            reviewReasonCode: null,
            bookingStatus: 'HOLDING',
            netCredited: 0,
            requiredPrepaymentAmount: 90000,
          }),
        );
      }
      if (text.includes('payments/requests/')) {
        // Poll bổ sung phải phản ánh đúng scenario, kẻo ghi đè trạng thái
        // recovery (ví dụ FAILED bị biến thành PENDING).
        const status = opts?.requestStatus ?? 'PENDING';
        return Promise.resolve(
          json({
            id: 'pr-1',
            paymentCode: 'BK-R1',
            purpose: 'PREPAYMENT',
            amount: 90000,
            currency: 'VND',
            method: 'PAYOS_TRANSFER',
            providerOrderCode: null,
            checkoutUrl: 'https://pay.example/x',
            status,
            expiresAt: defaultExpiresAt,
            vietQrPayload:
              opts?.requestPayload ??
              (status === 'PENDING' ? '000201QR-PAYLOAD' : null),
            reviewRequired: false,
            reviewReasonCode: null,
          }),
        );
      }
      return Promise.resolve(json({}));
    },
  );
  return calls;
}

function recoverySnapshot(overrides: {
  bookingStatus?: string;
  holdExpired?: boolean;
  payment?: null | {
    requestId?: string;
    status?: string;
    payload?: string | null;
    outcomeScreen?: string;
    requiresReview?: boolean;
  };
  canCreatePayment?: boolean;
  canCancelHold?: boolean;
  requiresReview?: boolean;
}) {
  const payment = overrides.payment
    ? {
        requestId: overrides.payment.requestId ?? 'pr-1',
        provider: 'PAYOS',
        status: overrides.payment.status ?? 'PENDING',
        amount: 90000,
        vietQrPayload: overrides.payment.payload ?? undefined,
        checkoutUrl: 'https://pay.example/x',
        outcomeScreen: overrides.payment.outcomeScreen ?? 'SCR_PENDING',
        requiresReview: overrides.payment.requiresReview ?? false,
      }
    : null;
  return {
    booking: {
      id: 'bk-r1',
      code: 'BK-R1',
      courtId: 'court-1',
      courtName: 'Sân 1',
      courtCode: 'C1',
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 90000000).toISOString(),
      totalAmount: 300000,
      prepaymentAmount: 90000,
      status: overrides.bookingStatus ?? 'HOLDING',
      holdExpiresAt: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
    },
    serverClock: {
      serverNow: new Date().toISOString(),
      remainingHoldSeconds: 240,
      isHoldExpired: overrides.holdExpired ?? false,
    },
    payment,
    allowedActions: {
      canReadRecovery: true,
      canPay: true,
      canShowQr: true,
      canCreatePayment: overrides.canCreatePayment ?? false,
      canCancelHold: overrides.canCancelHold ?? false,
      requiresReview: overrides.requiresReview ?? false,
      isHoldExpired: overrides.holdExpired ?? false,
    },
  };
}

function seedTokens() {
  (globalThis as any).sessionStorage.setItem(
    'guest-checkout-token:bk-r1',
    'checkout-1',
  );
  (globalThis as any).sessionStorage.setItem(
    'guest-manage-token:bk-r1',
    'manage-1',
  );
}

function mountResume() {
  return mount(
    <BookingQrModal
      isOpen
      bookingId="bk-r1"
      bookingCode="BK-R1"
      courtName="Sân 1"
      courtCode="C1"
      prepaymentAmount={90000}
      holdExpiresAt={new Date(Date.now() + 4 * 60 * 1000).toISOString()}
      onCancel={jest.fn()}
      onClose={jest.fn()}
      resumeOnly
    />,
  );
}

describe('Bước 4 — Modal QR resume chỉ-đọc (RECHECK-01/02/03)', () => {
  beforeEach(() => {
    try {
      (globalThis as any).sessionStorage.clear();
    } catch {}
    delete (globalThis as any).fetch;
  });

  afterEach(() => {
    // Dọn mọi root kể cả khi assert ném giữa test, kẻo interval treo Jest.
    while (mountedRoots.length > 0) mountedRoots.pop()!();
  });

  it('RECHECK-01 (Chưa có payment nhưng được tạo): hiện nút tạo QR chủ động, mount không POST', async () => {
    seedTokens();
    const calls = installFetch(
      recoverySnapshot({
        payment: null,
        canCreatePayment: true,
        canCancelHold: true,
      }),
    );
    const mounted = mountResume();
    await flush();
    const createBtn = Array.from(
      mounted.container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Tạo mã QR thanh toán'));
    expect(createBtn).toBeDefined();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(
      calls.some((c) => c.url.includes('/recovery') && c.method === 'GET'),
    ).toBe(true);
    expect(calls.find((c) => c.url.includes('/recovery'))?.checkoutToken).toBe(
      'checkout-1',
    );
    // S5-01: poll resume chỉ GET recovery, không gọi API member cần ManageToken.
    expect(
      calls.filter(
        (c) => c.url.includes('/api/payments/') || c.url.includes('guest/payments/'),
      ),
    ).toHaveLength(0);
    // Bấm tạo chủ động → đúng một POST checkout token.
    click(createBtn!);
    await flush();
    const createPosts = calls.filter(
      (c) =>
        c.method === 'POST' &&
        c.url.includes('/guest/bookings/bk-r1/payment-requests'),
    );
    expect(createPosts).toHaveLength(1);
    expect(createPosts[0].checkoutToken).toBe('checkout-1');
    mounted.unmount();
  });

  it('RECHECK-02 (Payment FAILED được retry): bấm thử lại gửi đúng một POST', async () => {
    seedTokens();
    const calls = installFetch(
      recoverySnapshot({
        payment: {
          requestId: 'pr-1',
          status: 'FAILED',
          payload: null,
          outcomeScreen: 'SCR_PENDING',
        },
        canCreatePayment: true,
        canCancelHold: true,
      }),
      { requestStatus: 'FAILED', requestPayload: null },
    );
    const mounted = mountResume();
    await flush();
    // S5-01: resume chỉ dùng GET recovery + trang recovery; không gọi API member.
    expect(
      calls.filter(
        (c) => c.url.includes('/api/payments/') || c.url.includes('guest/payments/'),
      ),
    ).toHaveLength(0);
    const retryBtn = Array.from(
      mounted.container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Thử tạo lại mã QR'));
    expect(retryBtn).toBeDefined();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    click(retryBtn);
    await flush();
    // S5-01: retry chủ động đi endpoint checkout token, đúng một POST.
    const posts = calls.filter(
      (c) =>
        c.method === 'POST' &&
        c.url.includes('/guest/bookings/bk-r1/payment-requests'),
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].checkoutToken).toBe('checkout-1');
    mounted.unmount();
  });

  it('RECHECK-03 (Đơn CANCELLED chưa có payment): báo kết thúc, ẩn QR và nút hủy', async () => {
    seedTokens();
    const calls = installFetch(
      recoverySnapshot({
        bookingStatus: 'CANCELLED',
        payment: null,
        canCreatePayment: false,
        canCancelHold: false,
      }),
    );
    const mounted = mountResume();
    await flush();
    expect(mounted.container.textContent).toContain('Đơn đã kết thúc');
    expect(mounted.container.textContent).not.toContain(
      'Đang khởi tạo mã thanh toán',
    );
    expect(mounted.container.textContent).not.toContain(
      'Đang chờ mã QR từ ngân hàng',
    );
    const cancelBtn = Array.from(
      mounted.container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Hủy đơn đặt sân này'));
    expect(cancelBtn).toBeUndefined();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    mounted.unmount();
  });

  it('FINAL-01 (Hủy thành công trong BookingQrModal): ẩn QR/link và chuyển sang trạng thái kết thúc ngay cả khi hộp thoại còn mở', async () => {
    seedTokens();
    const calls = installFetch(
      recoverySnapshot({
        bookingStatus: 'HOLDING',
        payment: {
          requestId: 'pr-1',
          status: 'PENDING',
          payload: '000201QR-PAYLOAD',
          outcomeScreen: 'SCR_PENDING',
        },
        canCreatePayment: false,
        canCancelHold: true,
      }),
    );
    const onCancel = jest.fn<() => Promise<void>>().mockResolvedValue();
    const mounted = mount(
      <BookingQrModal
        isOpen
        bookingId="bk-r1"
        bookingCode="BK-R1"
        courtName="Sân 1"
        courtCode="C1"
        prepaymentAmount={90000}
        holdExpiresAt={new Date(Date.now() + 4 * 60 * 1000).toISOString()}
        onCancel={onCancel}
        onClose={jest.fn()}
        resumeOnly
      />,
    );
    await flush();
    expect(
      mounted.container.querySelector('a[href="https://pay.example/x"]'),
    ).not.toBeNull();
    const cancelTrigger = Array.from(
      mounted.container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Hủy đơn đặt sân này'));
    expect(cancelTrigger).toBeDefined();
    click(cancelTrigger!);
    const confirmBtn = Array.from(
      mounted.container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Xác nhận hủy đơn'));
    expect(confirmBtn).toBeDefined();
    click(confirmBtn!);
    await flush();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(mounted.container.textContent).toContain('Đơn đã kết thúc');
    expect(
      mounted.container.querySelector('a[href="https://pay.example/x"]'),
    ).toBeNull();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    mounted.unmount();
  });

  it('FINAL-02 (Mở lại QR từ pending): nhấn ESC gọi onClose, trả focus về nút kích hoạt và không gọi onCancel', async () => {
    seedTokens();
    installFetch(
      recoverySnapshot({
        bookingStatus: 'HOLDING',
        payment: {
          requestId: 'pr-1',
          status: 'PENDING',
          payload: '000201QR-PAYLOAD',
          outcomeScreen: 'SCR_PENDING',
        },
        canCreatePayment: false,
        canCancelHold: true,
      }),
    );
    const trigger = dom.window.document.createElement('button');
    trigger.textContent = 'Tiếp tục thanh toán';
    dom.window.document.body.appendChild(trigger);
    trigger.focus();
    const triggerRef = { current: trigger };
    const onCancel = jest.fn();
    const onClose = jest.fn();

    function ResumeHarness() {
      const [open, setOpen] = React.useState(true);
      return (
        <BookingQrModal
          isOpen={open}
          bookingId="bk-r1"
          bookingCode="BK-R1"
          courtName="Sân 1"
          courtCode="C1"
          prepaymentAmount={90000}
          holdExpiresAt={new Date(Date.now() + 4 * 60 * 1000).toISOString()}
          onCancel={onCancel}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          resumeOnly
          triggerRef={triggerRef}
        />
      );
    }

    const mounted = mount(<ResumeHarness />);
    await flush();
    const dialog = mounted.container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.contains(dom.window.document.activeElement)).toBe(true);
    act(() => {
      dom.window.document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(mounted.container.querySelector('[role="dialog"]')).toBeNull();
    expect(dom.window.document.activeElement).toBe(trigger);
    mounted.unmount();
    trigger.remove();
  });

  it('REM-01 (GET bắt đầu trước khi hủy về muộn): không được ghi đè trạng thái đã hủy trong BookingQrModal', async () => {
    seedTokens();
    let releaseDelayedStatus: (() => void) | undefined;
    const expiryIso = new Date(Date.now() + 4 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();
    const jsonResp = (data: unknown) =>
      new Response(JSON.stringify({ success: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    (globalThis as any).fetch = jest.fn((url: string) => {
      const text = String(url);
      if (text.endsWith('/auth/csrf')) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: 'a'.repeat(64) }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      if (text.endsWith('/status')) {
        return new Promise((resolve) => {
          releaseDelayedStatus = () =>
            resolve(
              jsonResp({
                serverNow: nowIso,
                screen: 'SCR_PENDING',
                bookingStatus: 'HOLDING',
                reviewRequired: false,
                reviewReasonCode: null,
                netCredited: 0,
                requiredPrepaymentAmount: 90000,
              }),
            );
        });
      }
      return Promise.resolve(
        jsonResp({
          id: 'pr-delayed',
          paymentCode: 'BK-R1',
          purpose: 'PREPAYMENT',
          amount: 90000,
          currency: 'VND',
          method: 'PAYOS_TRANSFER',
          providerOrderCode: null,
          checkoutUrl: 'https://pay.example/delayed',
          status: 'PENDING',
          expiresAt: expiryIso,
          vietQrPayload: '000201QR-DELAYED',
          reviewRequired: false,
          reviewReasonCode: null,
        }),
      );
    });

    const onCancel = jest.fn<() => Promise<void>>().mockResolvedValue();
    const mounted = mount(
      <BookingQrModal
        isOpen
        bookingId="bk-r1"
        bookingCode="BK-R1"
        courtName="Sân 1"
        courtCode="C1"
        prepaymentAmount={90000}
        holdExpiresAt={expiryIso}
        onCancel={onCancel}
        onClose={jest.fn()}
      />,
    );
    await flush();
    expect(releaseDelayedStatus).toBeDefined();
    expect(
      mounted.container.querySelector('a[href="https://pay.example/delayed"]'),
    ).not.toBeNull();

    const cancelTrigger = Array.from(
      mounted.container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Hủy đơn đặt sân này'));
    click(cancelTrigger!);
    const confirmBtn = Array.from(
      mounted.container.querySelectorAll('button'),
    ).find((b) => b.textContent?.includes('Xác nhận hủy đơn'));
    click(confirmBtn!);
    await flush();

    expect(mounted.container.textContent).toContain('Đơn đã kết thúc');
    expect(
      mounted.container.querySelector('a[href="https://pay.example/delayed"]'),
    ).toBeNull();

    // Giải phóng phản hồi GET PENDING đã bắt đầu trước khi hủy
    releaseDelayedStatus!();
    await flush();

    expect(mounted.container.textContent).toContain('Đơn đã kết thúc');
    expect(
      mounted.container.querySelector('a[href="https://pay.example/delayed"]'),
    ).toBeNull();
    mounted.unmount();
  });

  it('FINAL-03 (Đồng hồ về 0): dừng polling tự động sau GET xác minh, bấm Tải lại trạng thái vẫn đọc được GET', async () => {
    jest.useFakeTimers();
    try {
      seedTokens();
      const shortExpiry = new Date(Date.now() + 1000).toISOString();
      const calls = installFetch(
        recoverySnapshot({
          bookingStatus: 'HOLDING',
          payment: {
            requestId: 'pr-1',
            status: 'PENDING',
            payload: '000201QR-PAYLOAD',
            outcomeScreen: 'SCR_PENDING',
          },
          canCreatePayment: false,
          canCancelHold: true,
        }),
        { expiresAt: shortExpiry },
      );
      const mounted = mount(
        <BookingQrModal
          isOpen
          bookingId="bk-r1"
          bookingCode="BK-R1"
          courtName="Sân 1"
          courtCode="C1"
          prepaymentAmount={90000}
          holdExpiresAt={shortExpiry}
          onCancel={jest.fn()}
          onClose={jest.fn()}
        />,
      );
      await act(async () => {
        for (let i = 0; i < 8; i += 1) await Promise.resolve();
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1100);
      });
      expect(mounted.container.textContent).toContain(
        'Hết thời gian hiển thị mã',
      );
      const baselineCalls = calls.length;
      await act(async () => {
        await jest.advanceTimersByTimeAsync(6500);
      });
      expect(calls.length).toBe(baselineCalls);
      const reloadBtn = Array.from(
        mounted.container.querySelectorAll('button'),
      ).find((b) => b.textContent?.includes('Tải lại trạng thái'));
      expect(reloadBtn).toBeDefined();
      click(reloadBtn!);
      await act(async () => {
        for (let i = 0; i < 6; i += 1) await Promise.resolve();
      });
      expect(calls.length).toBeGreaterThan(baselineCalls);
      mounted.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
