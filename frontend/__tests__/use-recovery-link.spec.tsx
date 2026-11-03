import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://127.0.0.1:4001/booking',
});

const BOOKING_ID = 'bk-9';
const TOKEN = 't'.repeat(64);

for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  IS_REDIRECT_ACT_ENVIRONMENT: true,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

if (!(globalThis as any).sessionStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', {
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
const { useRecoveryLink } = await import(
  '../features/payment/hooks/use-recovery-link.js'
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

describe('useRecoveryLink (đọc link email phục hồi AC-14/AC-19)', () => {
  it('đọc token từ hash, xóa sạch URL, lưu session và trả bookingId', async () => {
    const seen: Array<{ bookingId: string; token: string }> = [];
    (globalThis as any).fetch = jest.fn(async (url: string) => {
      seen.push({ bookingId: String(url), token: 'hdr' });
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            booking: {
              id: 'bk-9',
              code: 'BK-9',
              courtId: 'court-1',
              courtName: 'Sân 1',
              courtCode: 'C1',
              startsAt: new Date(Date.now() + 3600000).toISOString(),
              endsAt: new Date(Date.now() + 7200000).toISOString(),
              totalAmount: 300000,
              prepaymentAmount: 90000,
              status: 'HOLDING',
              holdExpiresAt: new Date(Date.now() + 240000).toISOString(),
            },
            serverClock: {
              serverNow: new Date().toISOString(),
              remainingHoldSeconds: 240,
              isHoldExpired: false,
            },
            payment: null,
            allowedActions: {
              canReadRecovery: true,
              canPay: true,
              canShowQr: false,
              canCreatePayment: true,
              canCancelHold: true,
              requiresReview: false,
              isHoldExpired: false,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    let observed: unknown = null;
    function Probe() {
      observed = useRecoveryLink();
      return null;
    }
    dom.window.history.replaceState(
      {},
      '',
      `/booking?recover=${BOOKING_ID}#recovery=${TOKEN}`,
    );
    (globalThis as any).sessionStorage.clear();
    const mounted = mount(<Probe />);
    await act(async () => {
      await Promise.resolve();
    });

    const state = observed as {
      status: string;
      bookingId: string | null;
      token: string | null;
      snapshot: unknown;
    };
    expect(state.bookingId).toBe(BOOKING_ID);
    expect(state.token).toBe(TOKEN);
    expect(state.status).toBe('ready');
    expect(state.snapshot).not.toBeNull();
    // AC-19: URL đã sạch token.
    expect(dom.window.location.hash).toBe('');
    expect(dom.window.location.search).not.toContain('recover');
    // Token sẵn cho các lần đọc lại (polling) qua session.
    expect(
      (globalThis as any).sessionStorage.getItem(
        `guest-checkout-token:${BOOKING_ID}`,
      ),
    ).toBe(TOKEN);
    mounted.unmount();
    delete (globalThis as any).fetch;
  });

  it('S5-07 (Đơn CONFIRMED không bị báo hết hạn): mở ở trạng thái sẵn sàng kèm snapshot', async () => {
    (globalThis as any).fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            booking: {
              id: BOOKING_ID,
              code: 'BK-9',
              courtId: 'court-1',
              courtName: 'Sân 1',
              courtCode: 'C1',
              startsAt: new Date(Date.now() - 7200000).toISOString(),
              endsAt: new Date(Date.now() - 3600000).toISOString(),
              totalAmount: 300000,
              prepaymentAmount: 90000,
              status: 'CONFIRMED',
              holdExpiresAt: new Date(Date.now() - 3600000).toISOString(),
            },
            serverClock: {
              serverNow: new Date().toISOString(),
              remainingHoldSeconds: 0,
              isHoldExpired: true,
            },
            payment: {
              requestId: 'pr-9',
              provider: 'PAYOS',
              status: 'PAID',
              amount: 90000,
              outcomeScreen: 'SCR04_SUCCESS',
              requiresReview: false,
            },
            allowedActions: {
              canReadRecovery: true,
              canPay: false,
              canShowQr: false,
              canCreatePayment: false,
              canCancelHold: false,
              requiresReview: false,
              isHoldExpired: true,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    let observed: unknown = null;
    function Probe() {
      observed = useRecoveryLink();
      return null;
    }
    dom.window.history.replaceState(
      {},
      '',
      `/booking?recover=${BOOKING_ID}#recovery=${TOKEN}`,
    );
    (globalThis as any).sessionStorage.clear();
    const mounted = mount(<Probe />);
    await act(async () => {
      await Promise.resolve();
    });

    const state = observed as {
      status: string;
      snapshot: { booking: { status: string } } | null;
    };
    // Đơn đã thanh toán mở đúng trạng thái, không báo "hết hạn giữ chỗ".
    expect(state.status).toBe('ready');
    expect(state.snapshot?.booking.status).toBe('CONFIRMED');
    mounted.unmount();
    delete (globalThis as any).fetch;
  });

  it('S5-08 (GET lỗi có đường thử lại): retry dùng identity trong bộ nhớ, không cần URL', async () => {
    let calls = 0;
    (globalThis as any).fetch = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ success: false }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            booking: {
              id: BOOKING_ID,
              code: 'BK-9',
              courtId: 'court-1',
              courtName: 'Sân 1',
              courtCode: 'C1',
              startsAt: new Date(Date.now() + 3600000).toISOString(),
              endsAt: new Date(Date.now() + 7200000).toISOString(),
              totalAmount: 300000,
              prepaymentAmount: 90000,
              status: 'HOLDING',
              holdExpiresAt: new Date(Date.now() + 240000).toISOString(),
            },
            serverClock: {
              serverNow: new Date().toISOString(),
              remainingHoldSeconds: 240,
              isHoldExpired: false,
            },
            payment: null,
            allowedActions: {
              canReadRecovery: true,
              canPay: true,
              canShowQr: false,
              canCreatePayment: true,
              canCancelHold: true,
              requiresReview: false,
              isHoldExpired: false,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });

    let observed: unknown = null;
    function Probe() {
      observed = useRecoveryLink();
      return null;
    }
    dom.window.history.replaceState(
      {},
      '',
      `/booking?recover=${BOOKING_ID}#recovery=${TOKEN}`,
    );
    (globalThis as any).sessionStorage.clear();
    const mounted = mount(<Probe />);
    await act(async () => {
      await Promise.resolve();
    });

    const failed = observed as { status: string; retry: () => void };
    expect(failed.status).toBe('error');
    expect(dom.window.location.hash).toBe('');
    await act(async () => {
      failed.retry();
      await Promise.resolve();
    });
    const recovered = observed as { status: string };
    expect(recovered.status).toBe('ready');
    expect(calls).toBe(2);
    mounted.unmount();
    delete (globalThis as any).fetch;
  });
});
