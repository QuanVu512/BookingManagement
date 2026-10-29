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
import { useCourtOccupancyGrid } from '../features/booking/hooks/use-court-occupancy-grid.js';

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

const GRID_PAYLOAD = (date: string, marker: string) => ({
  success: true,
  data: {
    courtId: 'court-1',
    date,
    timezone: 'Asia/Ho_Chi_Minh',
    serverNow: '2026-10-28T00:00:00.000Z',
    cleanupMinutes: 15,
    businessHours: { isClosed: false, open: '06:00', close: '23:00' },
    occupiedIntervals: [],
    marker,
  },
});

interface Deferred {
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<unknown>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

let pending: Deferred[];
let originalFetch: typeof fetch;

function installFetch(): void {
  pending = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = jest.fn(async (_input: unknown, init?: RequestInit) => {
    const slot = deferred();
    pending.push(slot);
    const signal = init?.signal as AbortSignal | undefined;
    if (signal) {
      if (signal.aborted) {
        slot.reject(
          new DOMException('This operation was aborted', 'AbortError'),
        );
      } else {
        signal.addEventListener('abort', () => {
          slot.reject(
            new DOMException('This operation was aborted', 'AbortError'),
          );
        });
      }
    }
    const body = await slot.promise;
    return {
      ok: true,
      json: async () => body,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

function payload(date: string, marker: string): unknown {
  return GRID_PAYLOAD(date, marker);
}

function Probe({
  courtId,
  date,
  onState,
}: {
  courtId: string;
  date: string;
  onState: (state: ReturnType<typeof useCourtOccupancyGrid>) => void;
}) {
  const state = useCourtOccupancyGrid(courtId, date, true);
  onState(state);
  return null;
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useCourtOccupancyGrid ordering and timeouts', () => {
  beforeEach(() => {
    installFetch();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('drops the old-day response when it resolves after the new-day response', async () => {
    let latest: ReturnType<typeof useCourtOccupancyGrid> | undefined;
    const root = createRoot(dom.window.document.getElementById('app')!);
    await act(async () => {
      root.render(
        <Probe
          courtId="court-1"
          date="2026-10-29"
          onState={(state) => {
            latest = state;
          }}
        />,
      );
    });
    await flush();
    expect(pending).toHaveLength(1);

    // Switch day while the first request is still in flight.
    await act(async () => {
      root.render(
        <Probe
          courtId="court-1"
          date="2026-10-30"
          onState={(state) => {
            latest = state;
          }}
        />,
      );
    });
    await flush();
    // Old request aborted (superseded) and a new one started.
    expect(pending).toHaveLength(2);

    // Resolve out of order: new day first, then the stale old day.
    const [oldDay, newDay] = pending;
    await act(async () => {
      newDay.resolve(payload('2026-10-30', 'new'));
    });
    await flush();
    await act(async () => {
      oldDay.resolve(payload('2026-10-29', 'old'));
    });
    await flush();

    expect(latest?.status).toBe('ready');
    expect(latest?.data?.date).toBe('2026-10-30');
    expect(latest?.data?.courtId).toBe('court-1');
    root.unmount();
  });

  it('moves an initial load to error on request timeout instead of hanging', async () => {
    jest.useFakeTimers();
    let latest: ReturnType<typeof useCourtOccupancyGrid> | undefined;
    const root = createRoot(dom.window.document.getElementById('app')!);
    await act(async () => {
      root.render(
        <Probe
          courtId="court-1"
          date="2026-10-29"
          onState={(state) => {
            latest = state;
          }}
        />,
      );
    });
    expect(latest?.status).toBe('loading');

    // Never resolve the request; advance past the 10s request timeout.
    await act(async () => {
      jest.advanceTimersByTime(10_500);
    });
    await flush();

    expect(latest?.status).toBe('error');
    expect(latest?.error).toContain('Không tải được lịch sân');
    root.unmount();
  });

  it('drops a stale response even when the transport ignores the abort', async () => {
    let latest: ReturnType<typeof useCourtOccupancyGrid> | undefined;
    const root = createRoot(dom.window.document.getElementById('app')!);
    await act(async () => {
      root.render(
        <Probe
          courtId="court-1"
          date="2026-10-29"
          onState={(state) => {
            latest = state;
          }}
        />,
      );
    });
    await flush();
    expect(pending).toHaveLength(1);

    // Switch day; the old transport keeps the request alive and resolves it
    // late anyway (abort ignored). Identity + monotonic seq must still win.
    const [oldDay] = pending;
    await act(async () => {
      root.render(
        <Probe
          courtId="court-1"
          date="2026-10-30"
          onState={(state) => {
            latest = state;
          }}
        />,
      );
    });
    await flush();
    const [, newDay] = pending;
    await act(async () => {
      oldDay.resolve(payload('2026-10-29', 'stale'));
    });
    await flush();
    // Stale data must never be applied, even though the transport delivered it.
    expect(latest?.data).toBeNull();
    await act(async () => {
      newDay.resolve(payload('2026-10-30', 'fresh'));
    });
    await flush();

    expect(latest?.status).toBe('ready');
    expect(latest?.data?.date).toBe('2026-10-30');
    root.unmount();
  });

  it('counts a background timeout as a failure instead of serving stale data silently', async () => {
    jest.useFakeTimers();
    let latest: ReturnType<typeof useCourtOccupancyGrid> | undefined;
    const root = createRoot(dom.window.document.getElementById('app')!);
    await act(async () => {
      root.render(
        <Probe
          courtId="court-1"
          date="2026-10-29"
          onState={(state) => {
            latest = state;
          }}
        />,
      );
    });
    await flush();
    await act(async () => {
      pending[0].resolve(payload('2026-10-29', 'initial'));
    });
    await flush();
    expect(latest?.status).toBe('ready');
    expect(latest?.failures).toBe(0);

    // Trigger a background poll and let it time out without resolving.
    await act(async () => {
      latest?.refresh();
    });
    await act(async () => {
      jest.advanceTimersByTime(10_500);
    });
    await flush();

    expect(latest?.status).toBe('ready');
    expect(latest?.failures).toBe(1);
    expect(latest?.data?.date).toBe('2026-10-29');
    root.unmount();
  });
});
