import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  getCurrentUser,
  loginAccount,
  registerAccount,
  logoutAccount,
} from '../services/auth.js';
import { loadCourtCatalog } from '../services/courts.js';
import { FALLBACK_COURTS } from '../data/courts.js';
import {
  READ_REQUEST_TIMEOUT_MS,
  AUTH_REQUEST_TIMEOUT_MS,
} from '../constants/network.js';

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
  it.each([401, 400, 429])(
    'does not retry HTTP %s and treats only 401 as unauthenticated',
    async (status) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async () => new Response('{}', { status }));
      const result = await getCurrentUser(new AbortController().signal);
      expect(result.status).toBe(
        status === 401 ? 'unauthenticated' : 'unknown',
      );
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );
  it('retries transient 5xx at most once', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{}', { status: 503 }));
    expect((await getCurrentUser(new AbortController().signal)).status).toBe(
      'unknown',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('recovers from a transient network failure on the second attempt', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, user: ACTIVE_USER })),
      );
    expect(await getCurrentUser(new AbortController().signal)).toEqual({
      status: 'authenticated',
      user: ACTIVE_USER,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('classifies malformed success as unknown without retry', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ user: 'invalid' })));
    expect((await getCurrentUser(new AbortController().signal)).status).toBe(
      'unknown',
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('bounds retry for a timeout while reading session response content', async () => {
    const response = new Response('{}');
    jest
      .spyOn(response, 'json')
      .mockRejectedValue(new DOMException('body deadline', 'TimeoutError'));
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    expect((await getCurrentUser(new AbortController().signal)).status).toBe(
      'unknown',
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  beforeEach(() => {
    jest.spyOn(console, 'info').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses a shared 1200ms request deadline', () =>
    expect(READ_REQUEST_TIMEOUT_MS).toBe(1200));

  it('reports catalog failure immediately when the backend connection fails', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new TypeError('mock network offline'));
    const start = performance.now();
    expect(await getCurrentUser(new AbortController().signal)).toMatchObject({
      status: 'unknown',
    });
    await expect(
      loadCourtCatalog(new AbortController().signal),
    ).rejects.toThrow();
    expect(performance.now() - start).toBeLessThan(300);
  });

  it('ends both stalled requests at the deadline instead of waiting for a TCP timeout', async () => {
    mockStalledFetch();
    const start = performance.now();
    const [user, courts] = await Promise.all([
      getCurrentUser(new AbortController().signal),
      loadCourtCatalog(new AbortController().signal).catch(
        (error: unknown) => error,
      ),
    ]);
    expect(user).toMatchObject({ status: 'unknown' });
    expect(courts).toBeInstanceOf(DOMException);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(READ_REQUEST_TIMEOUT_MS - 20);
    expect(elapsed).toBeLessThan(READ_REQUEST_TIMEOUT_MS * 2 + 300);
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
    expect(await getCurrentUser(new AbortController().signal)).toEqual({
      status: 'authenticated',
      user: ACTIVE_USER,
    });
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
  ])('rejects HTTP or malformed catalog failures', async (response) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(
      loadCourtCatalog(new AbortController().signal),
    ).rejects.toThrow();
  });

  it('keeps an empty API catalog empty', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: [] })),
      );
    expect(await loadCourtCatalog(new AbortController().signal)).toEqual([]);
  });

  it('treats an expired session as unauthenticated', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    expect(await getCurrentUser(new AbortController().signal)).toEqual({
      status: 'unauthenticated',
    });
  });
});

describe('Frontend auth mutations', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });
  const registration = {
    username: 'customer',
    fullName: 'Customer',
    email: 'customer@example.com',
    phone: '+84912345678',
    password: 'long password phrase',
    confirmPassword: 'long password phrase',
  };
  it('sends CSRF and credentials while preserving the password exactly', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'a'.repeat(64) })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true, user: ACTIVE_USER })),
      );
    await expect(
      loginAccount(' customer ', '  mật khẩu dài có dấu 😀  '),
    ).resolves.toEqual(ACTIVE_USER);
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/login'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'a'.repeat(64) }),
        body: JSON.stringify({
          username: 'customer',
          password: '  mật khẩu dài có dấu 😀  ',
        }),
      }),
    );
  });
  it.each(['login', 'register'] as const)(
    'bounds %s, including CSRF acquisition, with no mutation retries',
    async (kind) => {
      const controller = new AbortController();
      const timeout = jest
        .spyOn(AbortSignal, 'timeout')
        .mockReturnValue(controller.signal);
      mockStalledFetch();
      const pending =
        kind === 'login'
          ? loginAccount('customer', 'long password phrase')
          : registerAccount(registration);
      const assertion = expect(pending).rejects.toThrow('quá thời gian chờ');
      controller.abort(new DOMException('deadline', 'TimeoutError'));
      await assertion;
      expect(timeout).toHaveBeenCalledWith(AUTH_REQUEST_TIMEOUT_MS);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    },
  );
  it.each([401, 400, 429, 503])(
    'does not retry a login mutation on HTTP %s',
    async (status) => {
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ token: 'a'.repeat(64) })),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: 'controlled failure' }), {
            status,
          }),
        );
      await expect(
        loginAccount('customer', 'long password phrase'),
      ).rejects.toThrow('controlled failure');
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it('requires explicit logout success, rejecting malformed 200 responses', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'a'.repeat(64) })),
      )
      .mockResolvedValueOnce(new Response('{}'));
    await expect(logoutAccount()).rejects.toThrow();
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
