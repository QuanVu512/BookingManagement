import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://127.0.0.1:4134',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });

const { createRoot } = await import('react-dom/client');
const { PaymentHistoryPanel } = await import(
  '../features/booking/components/payment-history-panel.js'
);
const { HISTORY_REFRESH_COOLDOWN_MS } = await import(
  '../features/booking/hooks/use-booking-payment-history.js'
);

interface Pending {
  url: string;
  resolve: (response: Response) => void;
  reject: (reason: unknown) => void;
}

const originalFetch = globalThis.fetch;
let pending: Pending[] = [];
let calls: string[] = [];
let active = 0;
let maxActive = 0;
let root: ReturnType<typeof createRoot>;

function outcome(screen = 'SCR_PENDING') {
  return {
    screen,
    reviewRequired: false,
    reviewReasonCode: null,
    bookingStatus: 'HOLDING',
    netCredited: 0,
    requiredPrepaymentAmount: 50000,
  };
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function failure(status: number, message: string, retryAfter?: string) {
  return new Response(JSON.stringify({ success: false, message }), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(retryAfter ? { 'retry-after': retryAfter } : {}),
    },
  });
}

function bookings(prefix: string, count = 1) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    bookingCode: `BK-${prefix}-${index}`,
    courtId: 'court',
    courtName: `Court ${prefix}`,
    timezone: 'Asia/Ho_Chi_Minh',
    startsAt: '2035-01-08T01:00:00Z',
    endsAt: '2035-01-08T02:00:00Z',
    holdExpiresAt: '2035-01-08T01:05:00Z',
    status: 'HOLDING' as const,
    totalAmount: 100000,
    currency: 'VND',
    priceItems: [],
  }));
}

function settle(match: (url: string) => boolean, response: Response) {
  const index = pending.findIndex((entry) => match(entry.url));
  if (index < 0) throw new Error('No pending request matched');
  const [entry] = pending.splice(index, 1);
  entry.resolve(response);
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function settleAll(
  steps: Array<{ match: (url: string) => boolean; response: Response }>,
) {
  for (const step of steps) {
    settle(step.match, step.response);
    await flush();
  }
}

async function mount(accountId: string, list = bookings('A', 50)) {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing DOM root');
  if (root) await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () =>
    root.render(<PaymentHistoryPanel accountId={accountId} bookings={list} />),
  );
}

function button(label: string, scope: ParentNode = document) {
  const match = [...scope.querySelectorAll('button')].find(
    (element) => element.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match as HTMLButtonElement;
}

async function click(element: HTMLElement) {
  await act(async () => element.click());
}

beforeEach(() => {
  pending = [];
  calls = [];
  active = 0;
  maxActive = 0;
  globalThis.fetch = ((input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    calls.push(url);
    active += 1;
    maxActive = Math.max(maxActive, active);
    return new Promise<Response>((resolve, reject) => {
      pending.push({
        url,
        resolve: (response) => {
          active -= 1;
          resolve(response);
        },
        reject: (reason) => {
          active -= 1;
          reject(reason);
        },
      });
    });
  }) as typeof fetch;
});

afterEach(async () => {
  if (root) await act(async () => root.unmount());
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('RF-06B bounded on-demand payment history', () => {
  it('loads zero payment resources until one booking is expanded', async () => {
    await mount('A', bookings('A', 50));
    expect(document.querySelectorAll('article.booking-panel')).toHaveLength(50);
    expect(calls).toEqual([]);
    await click(button('Xem yêu cầu thanh toán'));
    expect(calls).toHaveLength(2);
    expect(maxActive).toBe(2);
    expect(calls.every((url) => url.includes('bookingId=A-0'))).toBe(true);
    expect(new Set(calls.map((url) => new URL(url).pathname))).toEqual(
      new Set(['/api/payments/requests']),
    );
    await act(async () => {
      settle((url) => url.includes('purpose=PREPAYMENT'), ok(outcome()));
      await flush();
    });
    expect(calls).toHaveLength(3);
    expect(calls.some((url) => url.includes('/api/refunds'))).toBe(true);
    expect(maxActive).toBeLessThanOrEqual(2);
    await act(async () => {
      settle((url) => url.includes('purpose=BALANCE'), ok(outcome('SCR04_SUCCESS')));
      settle((url) => url.includes('/api/refunds'), ok({ items: [] }));
      await flush();
      await flush();
    });
    const text = document.body.textContent ?? '';
    expect(text).toContain('Đang chờ thanh toán');
    expect(text).toContain('Đã thanh toán đủ');
    expect(text).toContain('Chưa có yêu cầu hoàn tiền.');
  });

  it('keeps resource failures independent and retries only the failed resource', async () => {
    await mount('A');
    await click(button('Xem yêu cầu thanh toán'));
    await act(async () => {
      await settleAll([
        { match: (url) => url.includes('purpose=PREPAYMENT'), response: ok(outcome()) },
        { match: (url) => url.includes('purpose=BALANCE'), response: failure(500, 'Máy chủ bận.') },
        { match: (url) => url.includes('/api/refunds'), response: ok({ items: [] }) },
      ]);
    });
    const balance = document.querySelector(
      'section[aria-label="Số dư còn lại"]',
    ) as HTMLElement;
    expect(balance.querySelector('[role="alert"]')?.textContent).toContain(
      'Máy chủ bận.',
    );
    expect(
      document.querySelector('section[aria-label="Thanh toán trước"]')
        ?.textContent,
    ).toContain('Đang chờ thanh toán');
    expect(
      document.querySelector('section[aria-label="Hoàn tiền"]')?.textContent,
    ).toContain('Chưa có yêu cầu hoàn tiền.');
    expect(calls).toHaveLength(3);
    await click(button('Thử lại', balance));
    expect(calls).toHaveLength(4);
    expect(calls[3]).toContain('purpose=BALANCE');
    await act(async () => {
      settle((url) => url.includes('purpose=BALANCE'), ok(outcome()));
      await flush();
    });
    expect(
      document
        .querySelector('section[aria-label="Số dư còn lại"]')
        ?.querySelector('[role="alert"]'),
    ).toBeNull();
  });

  it('honours Retry-After on throttled resource retries', async () => {
    await mount('A');
    await click(button('Xem yêu cầu thanh toán'));
    await act(async () => {
      await settleAll([
        { match: (url) => url.includes('purpose=PREPAYMENT'), response: failure(429, 'Thử lại sau.', '7') },
        { match: (url) => url.includes('purpose=BALANCE'), response: ok(outcome()) },
        { match: (url) => url.includes('/api/refunds'), response: ok({ items: [] }) },
      ]);
    });
    const prepayment = document.querySelector(
      'section[aria-label="Thanh toán trước"]',
    ) as HTMLElement;
    expect(prepayment.textContent).toContain('Có thể thử lại sau 7 giây.');
  });

  it('discards queued owner responses after the account changes', async () => {
    await mount('A');
    await click(button('Xem yêu cầu thanh toán'));
    expect(calls).toHaveLength(2);
    await mount('B', bookings('B', 1));
    await act(async () => {
      settle((url) => url.includes('bookingId=A-0'), ok(outcome('SCR04_SUCCESS')));
      await flush();
    });
    expect(document.body.textContent).not.toContain('Đã thanh toán đủ');
    expect(document.querySelector('article.booking-panel h3')?.textContent).toContain(
      'BK-B-0',
    );
  });

  it('refreshes the expanded booking with three reads then cools down', async () => {
    await mount('A');
    await click(button('Xem yêu cầu thanh toán'));
    await act(async () => {
      await settleAll([
        { match: (url) => url.includes('purpose=PREPAYMENT'), response: ok(outcome()) },
        { match: (url) => url.includes('purpose=BALANCE'), response: ok(outcome()) },
        { match: (url) => url.includes('/api/refunds'), response: ok({ items: [] }) },
      ]);
    });
    expect(calls).toHaveLength(3);
    await click(button('Cập nhật thanh toán'));
    expect(calls).toHaveLength(5);
    expect(button('Đang cập nhật…').disabled).toBe(true);
    await act(async () => {
      settle((url) => url.includes('purpose=PREPAYMENT'), ok(outcome()));
      await flush();
    });
    expect(calls).toHaveLength(6);
    await act(async () => {
      await settleAll([
        { match: (url) => url.includes('purpose=BALANCE'), response: ok(outcome()) },
        { match: (url) => url.includes('/api/refunds'), response: ok({ items: [] }) },
      ]);
    });
    const refreshButton = button('Cập nhật thanh toán');
    expect(refreshButton.disabled).toBe(true);
    expect(HISTORY_REFRESH_COOLDOWN_MS).toBe(10_000);
  });

  it('collapses the expanded booking without rendering stale data', async () => {
    await mount('A');
    await click(button('Xem yêu cầu thanh toán'));
    await click(button('Ẩn yêu cầu thanh toán'));
    expect(document.querySelector('[role="region"]')).toBeNull();
    await act(async () => {
      if (pending.length) settle(() => true, ok(outcome('SCR04_SUCCESS')));
      await flush();
    });
    expect(document.body.textContent).not.toContain('Đã thanh toán đủ');
  });
});
