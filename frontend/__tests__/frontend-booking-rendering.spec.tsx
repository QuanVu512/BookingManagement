import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { useLiveBooking } from '../features/booking/hooks/use-live-booking.js';
import { localInputToIso } from '../features/booking/model/booking-time.js';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14001',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { createRoot } = await import('react-dom/client');
const quote = {
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
const booking = {
  id: 'booking',
  bookingCode: 'BK-test',
  courtId: 'court',
  courtName: 'Court',
  timezone: quote.timezone,
  startsAt: quote.priceItems[0].startsAt,
  endsAt: quote.priceItems[0].endsAt,
  holdExpiresAt: '2026-10-16T03:05:00Z',
  status: 'HOLDING',
  totalAmount: 100001,
  currency: 'VND',
  priceItems: quote.priceItems,
};
let root: ReturnType<typeof createRoot>;
let controls: ReturnType<typeof useLiveBooking>;
function Probe({ account = 'A' }: { account?: string }) {
  controls = useLiveBooking('court', 'Asia/Ho_Chi_Minh', account);
  return <p>{controls.booking?.bookingCode ?? controls.error}</p>;
}
function requestUrl(value: string | URL | Request) {
  return typeof value === 'string'
    ? value
    : value instanceof URL
      ? value.href
      : value.url;
}
function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }));
}
function mount(account = 'A') {
  root.render(<Probe account={account} />);
}

describe('Booking client reconciliation and session boundaries', () => {
  beforeEach(async () => {
    const element = document.getElementById('app');
    if (!element) throw new Error('Missing fixture root');
    root = createRoot(element);
    await act(async () => mount());
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    jest.restoreAllMocks();
  });

  it.each(['2000-01-01', '2099-01-01'])(
    'blocks checking or booking invalid day %s before any HTTP request',
    async (date) => {
      const fetch = jest.spyOn(globalThis, 'fetch');
      await act(async () =>
        controls.changeWindow({ start: `${date}T08:00`, end: `${date}T09:00` }),
      );
      await act(async () => controls.quoteAvailability());
      expect(controls.error).toContain('Chỉ chọn ngày');
      await act(async () => controls.createHold());
      expect(controls.error).toContain('Chỉ chọn ngày');
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it('reuses the original key after a lost response even when availability is now occupied', async () => {
    const keys: string[] = [];
    let posted = false;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (requestUrl(url).endsWith('/auth/csrf'))
        return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
      if (requestUrl(url).includes('/availability'))
        return ok({ ...quote, available: !posted });
      const input: unknown = JSON.parse(
        typeof options?.body === 'string' ? options.body : '{}',
      );
      if (
        typeof input !== 'object' ||
        !input ||
        !('idempotencyKey' in input) ||
        typeof input.idempotencyKey !== 'string'
      )
        throw new Error('Missing key');
      keys.push(input.idempotencyKey);
      if (!posted) {
        posted = true;
        throw new TypeError('response lost');
      }
      return ok(booking);
    });
    await act(async () => controls.createHold());
    expect(controls.canRetry).toBe(true);
    await act(async () => controls.quoteAvailability());
    expect(controls.quote?.available).toBe(false);
    expect(controls.canRetry).toBe(true);
    await act(async () => controls.createHold());
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(controls.booking?.status).toBe('HOLDING');
    expect(controls.canRetry).toBe(false);
  });
  it('ignores double submit and hides an old account response after a session switch', async () => {
    let finish: (response: Response) => void = () => {
      throw new Error('No request');
    };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        requestUrl(url).endsWith('/auth/csrf')
          ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
          : new Promise<Response>((resolve) => {
              finish = resolve;
            }),
      );
    let pending: Promise<void>;
    await act(async () => {
      pending = controls.createHold();
      await controls.createHold();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => mount('B'));
    await act(async () => {
      finish(ok(booking));
      await pending;
    });
    expect(controls.booking).toBeUndefined();
    expect(document.body.textContent).not.toContain('BK-test');
  });
  it('rejects malformed success instead of presenting a confirmed hold', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        requestUrl(url).endsWith('/auth/csrf')
          ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
          : ok({ id: 'incomplete' }),
      );
    await act(async () => controls.createHold());
    expect(controls.booking).toBeUndefined();
    expect(controls.canRetry).toBe(true);
  });
  it('converts branch-local minute inputs independently of the host timezone', () => {
    expect(localInputToIso('2035-01-08T06:11', 'Asia/Ho_Chi_Minh')).toBe(
      '2035-01-07T23:11:00.000Z',
    );
    expect(() => localInputToIso('invalid', 'Asia/Ho_Chi_Minh')).toThrow();
  });

  it('invalidates quotes on quantity changes and binds hold retries to the selected services', async () => {
    const keys: string[] = [];
    const line = {
      productId: 'paddle',
      code: 'PADDLE',
      name: 'Thuê vợt',
      kind: 'PADDLE',
      billingMode: 'HOURLY_RENTAL',
      unit: 'vợt',
      unitPrice: 30000,
      quantity: 1,
      durationMinutes: 60,
      amount: 30000,
    };
    let first = true;
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      if (requestUrl(url).endsWith('/auth/csrf'))
        return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
      if (requestUrl(url).endsWith('/quote'))
        return ok({ ...quote, serviceItems: [line], totalAmount: 130001 });
      if (typeof options?.body !== 'string')
        throw new Error('Missing request body');
      const input: unknown = JSON.parse(options.body);
      if (
        typeof input !== 'object' ||
        !input ||
        !('idempotencyKey' in input) ||
        typeof input.idempotencyKey !== 'string'
      )
        throw new Error('Missing key');
      expect(input).toMatchObject({
        services: [{ productId: 'paddle', quantity: 1 }],
      });
      keys.push(input.idempotencyKey);
      if (first) {
        first = false;
        throw new TypeError('lost response');
      }
      return ok({ ...booking, serviceItems: [line], totalAmount: 130001 });
    });
    await act(async () => controls.changeService('paddle', 1));
    await act(async () => controls.quoteAvailability());
    expect(controls.quote?.totalAmount).toBe(130001);
    await act(async () => controls.changeService('paddle', 2));
    expect(controls.quote).toBeUndefined();
    await act(async () => controls.changeService('paddle', 1));
    await act(async () => controls.createHold());
    expect(controls.canRetry).toBe(true);
    await act(async () => controls.createHold());
    expect(keys[0]).toBe(keys[1]);
    expect(controls.booking?.serviceItems?.[0].quantity).toBe(1);
  });
});
