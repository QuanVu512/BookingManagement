import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { getCurrentUser } from '../../frontend/services/auth.js';
import { loadCourtCatalog } from '../../frontend/services/courts.js';
import { FALLBACK_COURTS } from '../../frontend/data/courts.js';
import { READ_REQUEST_TIMEOUT_MS } from '../../frontend/constants/network.js';

const ACTIVE_USER = {
  id: 'user-1',
  username: 'customer',
  fullName: 'Test Customer',
  email: 'customer@business.vn',
  phone: '+84912345678',
  roles: ['CUSTOMER'],
  primaryRole: 'CUSTOMER',
  isStaffOrAdmin: false,
};

describe('Frontend read requests', () => {
  beforeEach(() =>
    jest.spyOn(console, 'info').mockImplementation(() => undefined),
  );
  afterEach(() => jest.restoreAllMocks());

  it('uses a shared 1200ms request deadline', () =>
    expect(READ_REQUEST_TIMEOUT_MS).toBe(1200));

  it('falls back immediately when the backend connection fails', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('mock network offline'));
    const start = performance.now();
    expect(await getCurrentUser(new AbortController().signal)).toBeNull();
    expect(await loadCourtCatalog(new AbortController().signal)).toBe(
      FALLBACK_COURTS,
    );
    expect(performance.now() - start).toBeLessThan(300);
  });

  it('ends both stalled requests at the deadline instead of waiting for a TCP timeout', async () => {
    mockStalledFetch();
    const start = performance.now();
    const [user, courts] = await Promise.all([
      getCurrentUser(new AbortController().signal),
      loadCourtCatalog(new AbortController().signal),
    ]);
    expect(user).toBeNull();
    expect(courts).toBe(FALLBACK_COURTS);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(READ_REQUEST_TIMEOUT_MS - 20);
    expect(elapsed).toBeLessThan(READ_REQUEST_TIMEOUT_MS + 300);
  });

  it('propagates caller cancellation without logging or returning fallback data', async () => {
    mockStalledFetch();
    const controller = new AbortController();
    const userRequest = getCurrentUser(controller.signal);
    const courtRequest = loadCourtCatalog(controller.signal);
    controller.abort();
    await expect(userRequest).rejects.toThrow();
    await expect(courtRequest).rejects.toThrow();
    expect(console.info).not.toHaveBeenCalled();
  });

  it('returns online session data with credentials enabled', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, user: ACTIVE_USER })),
      );
    expect(await getCurrentUser(new AbortController().signal)).toEqual(
      ACTIVE_USER,
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/auth/me'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('returns online catalog data without replacing it with demo data', async () => {
    const onlineCourts = [
      { ...FALLBACK_COURTS[0], id: 'live-court', pricePerHour: 190000 },
    ];
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: onlineCourts })),
      );
    expect(await loadCourtCatalog(new AbortController().signal)).toEqual(
      onlineCourts,
    );
  });

  it.each([
    new Response('{}', { status: 503 }),
    new Response(JSON.stringify({ data: 'malformed' })),
  ])('falls back on HTTP or malformed catalog failures', async (response) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    expect(await loadCourtCatalog(new AbortController().signal)).toBe(
      FALLBACK_COURTS,
    );
  });

  it('treats an expired session as unauthenticated', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await getCurrentUser(new AbortController().signal)).toBeNull();
  });
});

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
