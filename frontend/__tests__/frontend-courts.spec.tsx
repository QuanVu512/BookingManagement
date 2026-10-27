import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act, createElement, type ReactNode } from 'react';
import type { CourtItem } from '../features/courts/model/court';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14001',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const router = { push: jest.fn(), prefetch: jest.fn() };
jest.unstable_mockModule('next/navigation', () => ({
  useRouter: () => router,
}));
const { createRoot } = await import('react-dom/client');
const { AuthProvider } = await import('../context/auth-context.js');
jest.unstable_mockModule('next/image', () => ({
  default: (props: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    sizes?: string;
  }) => createElement('img', props),
}));
const { CourtInfoCard } =
  await import('../features/courts/components/court-info-card.js');
const { useCourtCatalog } =
  await import('../features/courts/hooks/use-court-catalog.js');
const { useCourtDetail } =
  await import('../features/courts/hooks/use-court-detail.js');
const { loadCourtCatalog, loadCourtDetail } =
  await import('../features/courts/api/court-api.js');

const { BookingDateInput } =
  await import('../features/booking/components/booking-schedule-picker.js');
const { bookingDateBounds, formatBookingDate } =
  await import('../features/booking/model/booking-time.js');

const COURT: CourtItem = {
  id: 'court-1',
  name: 'Court One',
  code: 'VIP-01',
  courtType: 'VIP',
  status: 'ACTIVE',
  surfaceType: 'Sân Pickleball trong nhà Cushion Pro',
  features: ['Vệ sinh 15 phút sau lượt chơi'],
  pricePerHour: 100000,
  imageUrl: '/courts/court-1.jpg',
  rating: 0,
  reviewCount: 0,
  timezone: 'Asia/Ho_Chi_Minh',
  branchName: 'Test branch',
  address: 'Public address',
  cleanupMinutes: 15,
};
const QUOTE = {
  available: true,
  reason: null,
  totalAmount: 100001,
  currency: 'VND',
  cleanupMinutes: 15,
  timezone: 'Asia/Ho_Chi_Minh',
  serverNow: '2026-10-16T03:00:00Z',
  occupiedUntil: '2035-01-08T02:15:00Z',
  priceItems: [
    {
      startsAt: '2035-01-08T01:00:00Z',
      endsAt: '2035-01-08T02:00:00Z',
      durationMinutes: 60,
      pricePerHour: 100001,
      amount: 100001,
    },
  ],
};

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

async function render(element: ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(element);
  });
  await flush();
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function text() {
  return container?.textContent ?? '';
}

function buttonByText(text: string) {
  return [...(container?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent === text,
  );
}

function mockStalledFetch(): void {
  jest.spyOn(globalThis, 'fetch').mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) reject(signal.reason);
        else
          signal?.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          });
      }),
  );
}

beforeEach(() => {
  jest.restoreAllMocks();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = undefined;
  root = undefined;
  jest.restoreAllMocks();
});

describe('Booking date picker contract', () => {
  it('displays dd/MM/yyyy, restricts the native calendar and rejects injected out-of-range dates', async () => {
    const timezone = 'Asia/Ho_Chi_Minh';
    const bounds = bookingDateBounds(timezone);
    const change = jest.fn();
    await render(
      createElement(BookingDateInput, {
        value: bounds.min,
        onChange: change,
        timezone,
      }),
    );
    const input = container?.querySelector('input[type="date"]');
    if (!(input instanceof dom.window.HTMLInputElement))
      throw new Error('Missing date picker');
    expect(input.min).toBe(bounds.min);
    expect(input.max).toBe(bounds.max);
    expect(text()).toBe(formatBookingDate(bounds.min));
    const descriptor = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    );
    if (!descriptor?.set) throw new Error('Missing date setter');
    for (const invalid of ['2000-01-01', '2099-01-01']) {
      await act(async () => {
        descriptor.set?.call(input, invalid);
        input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      expect(change).not.toHaveBeenCalled();
      expect(input.value).toBe(bounds.min);
    }
    await act(async () => {
      descriptor.set?.call(input, bounds.max);
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith(bounds.max);
  });
});

describe('Courts feature API', () => {
  it('loads a detail with encoded URL, no-store and the bounded signal', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: COURT })),
      );
    const controller = new AbortController();
    await expect(
      loadCourtDetail('court id', controller.signal),
    ).resolves.toEqual(COURT);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/courts\/court%20id$/),
      expect.objectContaining({
        cache: 'no-store',
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('maps a missing detail to the preserved 404 message', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 404 }));
    await expect(
      loadCourtDetail('court-1', new AbortController().signal),
    ).rejects.toThrow('Không tìm thấy sân đang hoạt động.');
  });

  it('rejects malformed detail and catalog payloads', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(JSON.stringify({ success: true, data: { id: 'x' } })),
      );
    await expect(
      loadCourtDetail('court-1', new AbortController().signal),
    ).rejects.toThrow('Dữ liệu sân không hợp lệ.');
    await expect(
      loadCourtCatalog(new AbortController().signal),
    ).rejects.toThrow('Dữ liệu danh mục sân không hợp lệ.');
  });

  it('ends a stalled detail request at the 1200ms deadline', async () => {
    mockStalledFetch();
    const start = performance.now();
    const result = await loadCourtDetail(
      'court-1',
      new AbortController().signal,
    ).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(DOMException);
    expect(performance.now() - start).toBeGreaterThanOrEqual(1180);
  });

  it('propagates caller cancellation for a detail request', async () => {
    mockStalledFetch();
    const controller = new AbortController();
    const request = loadCourtDetail('court-1', controller.signal);
    controller.abort();
    await expect(request).rejects.toThrow();
  });
});

describe('Courts feature hooks', () => {
  it('loads the catalog, exposes a retry error, and keeps an empty result empty', async () => {
    let state: ReturnType<typeof useCourtCatalog> | undefined;
    function CatalogProbe() {
      state = useCourtCatalog();
      return createElement(
        'span',
        null,
        state.loading ? 'loading' : state.error || state.courts.length,
      );
    }
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, data: [] })),
      );
    await render(createElement(CatalogProbe));
    expect(state?.loading).toBe(false);
    expect(state?.error).toBe('Không tải được danh mục sân. Vui lòng thử lại.');
    expect(state?.courts).toEqual([]);
    await act(async () => {
      state?.retry();
    });
    await flush();
    expect(state?.error).toBe('');
    expect(state?.courts).toEqual([]);
  });

  it('resets the detail when courtId changes and ignores the aborted response', async () => {
    let state: ReturnType<typeof useCourtDetail> | undefined;
    function DetailProbe({ courtId }: { courtId: string }) {
      state = useCourtDetail(courtId);
      return createElement(
        'span',
        null,
        state.court?.id ?? (state.error || 'pending'),
      );
    }
    const pending: ((response: Response) => void)[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          pending.push(resolve);
        }),
    );
    await render(createElement(DetailProbe, { courtId: 'court-a' }));
    expect(state?.court).toBeUndefined();
    await act(async () => {
      root?.render(createElement(DetailProbe, { courtId: 'court-b' }));
    });
    await flush();
    await act(async () => {
      pending[0]?.(
        new Response(
          JSON.stringify({
            success: true,
            data: { ...COURT, id: 'court-a' },
          }),
        ),
      );
    });
    await flush();
    expect(state?.court).toBeUndefined();
    await act(async () => {
      pending[1]?.(
        new Response(
          JSON.stringify({
            success: true,
            data: { ...COURT, id: 'court-b' },
          }),
        ),
      );
    });
    await flush();
    expect(state?.court?.id).toBe('court-b');
  });
});

describe('Court detail page composition', () => {
  it('loads real service choices, quotes the selected quantity, and clears the amount when it changes', async () => {
    const product = {
      id: '60000000-0000-4000-8000-000000000004',
      code: 'PADDLE',
      name: 'Thuê vợt Pickleball',
      imageUrl: '/products/paddle-carbon.jpg',
      availableQuantity: 10,
      kind: 'PADDLE',
      billingMode: 'HOURLY_RENTAL',
      unit: 'vợt',
      unitPrice: 30000,
    };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.endsWith('/auth/me'))
          return new Response('{}', { status: 401 });
        if (url.includes('/services'))
          return new Response(
            JSON.stringify({ success: true, data: [product] }),
          );
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              ...QUOTE,
              totalAmount: 130001,
              serviceItems: [
                {
                  productId: product.id,
                  code: product.code,
                  name: product.name,
                  kind: product.kind,
                  billingMode: product.billingMode,
                  unit: product.unit,
                  unitPrice: 30000,
                  quantity: 1,
                  durationMinutes: 60,
                  amount: 30000,
                },
              ],
            },
          }),
        );
      });
    await render(
      createElement(AuthProvider, {
        children: createElement(CourtInfoCard, { court: COURT }),
      }),
    );
    const quantity = container?.querySelector('input[type="number"]');
    if (!(quantity instanceof dom.window.HTMLInputElement))
      throw new Error('Missing service quantity');
    const descriptor = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    );
    if (!descriptor?.set) throw new Error('Missing input setter');
    await act(async () => {
      descriptor.set?.call(quantity, '1');
      quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => buttonByText('Kiểm tra lịch & giá')?.click());
    await flush();
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/quote'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"quantity":1'),
      }),
    );
    expect(
      container?.querySelector('.order-total strong')?.textContent,
    ).toContain('130.001');
    expect(text()).toContain('Chỉ cho thuê');
    expect(text()).toContain('60 phút');
    expect(
      container?.querySelector('img[alt="Thuê vợt Pickleball"]'),
    ).not.toBeNull();
    expect(text()).not.toContain('Thuê theo thời lượng đặt sân');
    expect(text()).not.toContain('Khoảng sân đang trống');
    expect(text()).not.toContain('Tôi đồng ý giữ chỗ');
    expect(buttonByText('Đặt sân')).toBeDefined();
    const plus = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="Tăng Thuê vợt Pickleball"]',
    );
    await act(async () => plus?.click());
    expect(quantity.value).toBe('2');
    await act(async () => {
      descriptor.set?.call(quantity, '100');
      quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    expect(quantity.value).toBe('10');
    expect(plus?.disabled).toBe(true);

    await act(async () => {
      descriptor.set?.call(quantity, '2');
      quantity.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    expect(container?.querySelector('.order-total strong')?.textContent).toBe(
      '—',
    );
  });

  it('mounts the booking panel with the court id and timezone', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        if (url.includes('/api/auth/me'))
          return new Response('{}', { status: 401 });
        if (url.includes('/availability'))
          return new Response(JSON.stringify({ success: true, data: QUOTE }));
        return new Response('{}', { status: 404 });
      });
    await render(
      createElement(AuthProvider, {
        children: createElement(CourtInfoCard, { court: COURT }),
      }),
    );
    expect(text()).toContain('Giờ theo Asia/Ho_Chi_Minh');
    const quoteButton = buttonByText('Kiểm tra lịch & giá');
    expect(quoteButton).toBeDefined();
    await act(async () => {
      quoteButton?.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });
    await flush();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/courts/court-1/availability?'),
      expect.anything(),
    );
    expect(
      container?.querySelector('.order-total strong')?.textContent,
    ).toContain('100.001');
    expect(text()).toContain('Tóm tắt thanh toán');
    expect(text()).toContain('Nước uống & dụng cụ');
    const preset = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="18:00 – 19:00"]',
    );
    await act(async () => preset?.click());
    expect(text()).not.toContain('Khoảng sân đang trống');
    expect(container?.querySelector('.order-total strong')?.textContent).toBe(
      '—',
    );
    const hold = buttonByText('Đặt sân');
    expect(hold?.disabled).toBe(true);
  });

  it('blocks booking when the court has no timezone and does not mount the panel', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    await render(
      createElement(CourtInfoCard, {
        court: { ...COURT, timezone: undefined },
      }),
    );
    expect(text()).toContain('Thiếu cấu hình múi giờ của sân. Chưa thể đặt.');
    expect(text()).not.toContain('Giờ theo');
    expect(fetch).not.toHaveBeenCalled();
  });
});
