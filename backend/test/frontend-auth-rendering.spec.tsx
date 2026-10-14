import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { act, StrictMode } from 'react';

const dom = new JSDOM(
  '<!doctype html><html><body><div id="app"></div></body></html>',
  {
    url: 'http://127.0.0.1:4131',
    pretendToBeVisual: true,
  },
);
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}
jest.unstable_mockModule('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), prefetch: jest.fn() }),
}));
const { createRoot } = await import('react-dom/client');
const { AuthProvider, useAuth } =
  await import('../../frontend/context/auth-context.js');
const { ThemeProvider } =
  await import('../../frontend/context/theme-context.js');
const { SportyHeader } =
  await import('../../frontend/components/home/sporty-header.js');
const { AuthModal } =
  await import('../../frontend/components/auth/auth-modal.js');
const { AuthRecoveryForm } =
  await import('../../frontend/components/auth/auth-recovery-form.js');

let root: ReturnType<typeof createRoot>;
let controls: ReturnType<typeof useAuth> | undefined;
let headerCommits = 0;

function ControlsProbe() {
  controls = useAuth();
  return null;
}
// Count the actual Header body, rather than relying on production Profiler callbacks.
function ObservedHeader() {
  headerCommits += 1;
  return SportyHeader({});
}
function getControls() {
  if (!controls) throw new Error('Auth controls not mounted');
  return controls;
}

describe('Auth context and modal rendering', () => {
  beforeEach(async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 401 }));
    const container = document.getElementById('app');
    if (!container) throw new Error('Missing DOM root');
    root = createRoot(container);
    await act(async () =>
      root.render(
        <ThemeProvider>
          <AuthProvider>
            <ObservedHeader />
            <ControlsProbe />
            <AuthModal />
          </AuthProvider>
        </ThemeProvider>,
      ),
    );
    expect(headerCommits).toBeGreaterThan(0);
    headerCommits = 0;
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    jest.restoreAllMocks();
    controls = undefined;
  });

  it('isolates Header from modal open/close state', async () => {
    await act(async () => getControls().openAuthModal());
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => getControls().closeAuthModal());
    mkdirSync('.temp/auth-performance', { recursive: true });
    writeFileSync(
      '.temp/auth-performance/after-render.json',
      JSON.stringify({
        renderer: 'React DOM + jsdom',
        headerCommitsOnOpenAndClose: headerCommits,
      }),
    );
    expect(headerCommits).toBe(0);
  });

  it('focuses the first input when the modal mounts', async () => {
    await act(async () => getControls().openAuthModal());
    expect(document.activeElement?.id).toBe('auth-username');
    expect(headerCommits).toBe(0);
  });

  it('keeps callbacks stable across modal and guest changes', async () => {
    const initial = getControls();
    await act(async () => initial.openAuthModal());
    await act(async () => getControls().openGuestConfirm());
    expect(getControls().isAuthModalOpen).toBe(false);
    expect(getControls().isGuestConfirmOpen).toBe(true);
    await act(async () => getControls().proceedAsGuest());
    expect(getControls().guestSessionActive).toBe(true);
    expect(getControls().isGuestConfirmOpen).toBe(false);
    for (const name of [
      'openAuthModal',
      'closeAuthModal',
      'openGuestConfirm',
      'closeGuestConfirm',
      'login',
      'register',
      'logout',
    ] as const) {
      expect(getControls()[name]).toBe(initial[name]);
    }
    expect(headerCommits).toBe(0);
  });

  it('blocks duplicate submit synchronously, locks inputs, and unlocks on failure', async () => {
    await act(async () => getControls().openAuthModal());
    await act(async () => {
      setInput('auth-username', 'perfuser01');
      setInput('auth-password', 'SecretPhrase1!');
    });
    let finishRequest: ((response: Response) => void) | undefined;
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishRequest = resolve;
        }),
    );
    fetch.mockClear();
    const form = document.querySelector('form');
    if (!form) throw new Error('Missing auth form');
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getInput('auth-username').matches(':disabled')).toBe(true);
    expect(document.querySelector('.spinner')).not.toBeNull();
    expect(form.getAttribute('aria-busy')).toBe('true');
    const complete = finishRequest;
    if (!complete) throw new Error('No pending auth request');
    await act(async () =>
      complete(
        new Response(JSON.stringify({ message: 'Test server failure' }), {
          status: 503,
        }),
      ),
    );
    expect(getInput('auth-username').matches(':disabled')).toBe(false);
    expect(form.getAttribute('aria-busy')).toBe('false');
    expect(document.querySelector('.spinner')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Test server failure',
    );
    expect(headerCommits).toBe(0);
  });

  it('updates Header on a real session state change and preserves action identities', async () => {
    const initial = getControls();
    const user = {
      id: 'test-user',
      username: 'perfuser01',
      fullName: 'Performance User',
      email: 'performance@example.com',
      phone: '+84912345678',
      roles: ['CUSTOMER'],
      primaryRole: 'CUSTOMER',
      isStaffOrAdmin: false,
    };
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        typeof input === 'string' && input.endsWith('/csrf')
          ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
          : new Response(JSON.stringify({ success: true, user })),
      );
    await act(async () => {
      await getControls().login('perfuser01', 'SecretPhrase1!');
    });
    expect(getControls().user).toEqual(user);
    expect(headerCommits).toBeGreaterThan(0);
    expect(getControls().login).toBe(initial.login);
    expect(getControls().logout).toBe(initial.logout);
  });

  it.each(['network', 'server'])(
    'retains user and guest state and displays a %s logout failure',
    async (failure) => {
      const user = {
        id: 'user-1',
        username: 'customer',
        fullName: 'Customer',
        email: 'customer@example.com',
        phone: '+84912345678',
        roles: ['CUSTOMER'],
        primaryRole: 'CUSTOMER',
        isStaffOrAdmin: false,
      };
      const fetch = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(async (input) =>
          typeof input === 'string' && input.endsWith('/csrf')
            ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
            : new Response(JSON.stringify({ success: true, user })),
        );
      await act(async () => {
        await getControls().login('customer', 'long password phrase');
        getControls().proceedAsGuest();
      });
      fetch.mockImplementation(async (input) => {
        if (typeof input === 'string' && input.endsWith('/csrf'))
          return new Response(JSON.stringify({ token: 'a'.repeat(64) }));
        if (failure === 'network') throw new TypeError('offline');
        return new Response('{}', { status: 503 });
      });
      await act(async () => {
        await expect(getControls().logout()).rejects.toThrow();
      });
      expect(getControls().status).toBe('authenticated');
      expect(getControls().user).toEqual(user);
      expect(getControls().guestSessionActive).toBe(true);
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        'Chưa thể xác nhận đăng xuất',
      );
    },
  );

  it('clears session and guest state only after confirmed logout', async () => {
    const user = {
      id: 'user-1',
      username: 'customer',
      fullName: 'Customer',
      email: 'customer@example.com',
      phone: '+84912345678',
      roles: ['CUSTOMER'],
      primaryRole: 'CUSTOMER',
      isStaffOrAdmin: false,
    };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        typeof input === 'string' && input.endsWith('/csrf')
          ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
          : new Response(JSON.stringify({ success: true, user })),
      );
    await act(async () => {
      await getControls().login('customer', 'long password phrase');
      getControls().proceedAsGuest();
    });
    fetch.mockImplementation(async (input) =>
      typeof input === 'string' && input.endsWith('/csrf')
        ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
        : new Response(
            JSON.stringify({ success: true, message: 'Đăng xuất thành công' }),
          ),
    );
    await act(async () => {
      await getControls().logout();
    });
    expect(getControls().status).toBe('unauthenticated');
    expect(getControls().user).toBeNull();
    expect(getControls().guestSessionActive).toBe(false);
  });

  it('retains the last known user while an unknown session is rechecked, then clears only on 401', async () => {
    const user = {
      id: 'user-1',
      username: 'customer',
      fullName: 'Customer',
      email: 'customer@example.com',
      phone: '+84912345678',
      roles: ['CUSTOMER'],
      primaryRole: 'CUSTOMER',
      isStaffOrAdmin: false,
    };
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        typeof input === 'string' && input.endsWith('/csrf')
          ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
          : new Response(JSON.stringify({ success: true, user })),
      );
    await act(async () => {
      await getControls().login('customer', 'long password phrase');
    });
    fetch.mockRejectedValue(new TypeError('offline')).mockClear();
    await act(async () => {
      await getControls().refreshSession();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getControls().status).toBe('unknown');
    expect(getControls().user).toEqual(user);
    expect(getControls().isAuthenticated).toBe(false);
    expect(document.body.textContent).toContain('Thử lại phiên');
    fetch.mockResolvedValue(new Response('{}', { status: 401 })).mockClear();
    await act(async () => {
      await getControls().refreshSession();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getControls().status).toBe('unauthenticated');
    expect(getControls().user).toBeNull();
  });

  it('leaves registration pending instead of creating an authenticated session', async () => {
    await act(async () => getControls().openAuthModal());
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      typeof input === 'string' && input.endsWith('/csrf')
        ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
        : new Response(
            JSON.stringify({
              success: true,
              status: 'verification_required',
              message: 'Kiểm tra email để xác minh.',
            }),
          ),
    );
    await act(async () => {
      await getControls().register({
        username: 'customer',
        fullName: 'Customer',
        email: 'customer@example.com',
        phone: '+84912345678',
        password: 'long password phrase',
        confirmPassword: 'long password phrase',
      });
    });
    expect(getControls().status).toBe('unauthenticated');
    expect(getControls().user).toBeNull();
    expect(getControls().isAuthModalOpen).toBe(true);
  });

  it('unlocks form loading after an auth timeout', async () => {
    await act(async () => getControls().openAuthModal());
    await act(async () => {
      setInput('auth-username', 'customer');
      setInput('auth-password', 'long password phrase');
    });
    const controller = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) =>
            init?.signal?.addEventListener(
              'abort',
              () => reject(init.signal?.reason),
              { once: true },
            ),
          ),
      );
    const form = document.querySelector('form');
    if (!form) throw new Error('Missing auth form');
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(form.getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      controller.abort(new DOMException('deadline', 'TimeoutError'));
    });
    expect(form.getAttribute('aria-busy')).toBe('false');
    expect(getInput('auth-password').matches(':disabled')).toBe(false);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'quá thời gian chờ',
    );
  });

  it('preserves a verification fragment under StrictMode and consumes only on explicit submit', async () => {
    const token = 'b'.repeat(64);
    dom.window.history.replaceState(
      null,
      '',
      `/auth/verify-email#token=${token}`,
    );
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        typeof input === 'string' && input.endsWith('/csrf')
          ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
          : new Response(
              JSON.stringify({
                success: true,
                message: 'Email đã được xác minh.',
              }),
            ),
      );
    fetch.mockClear();
    await act(async () => {
      root.render(
        <StrictMode>
          <AuthRecoveryForm mode="verify-email" />
        </StrictMode>,
      );
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(dom.window.location.hash).toBe('');
    expect(document.body.textContent).not.toContain(token);
    const form = document.querySelector('form');
    if (!form) throw new Error('Missing verification form');
    expect(form.querySelector('button')?.disabled).toBe(false);
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/verify-email'),
      expect.objectContaining({ body: JSON.stringify({ token }) }),
    );
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'đã được xác minh',
    );
    expect(form.querySelector('fieldset')?.disabled).toBe(true);
  });

  it('validates reset confirmation before sending and accepts the exact Unicode passphrase', async () => {
    const token = 'c'.repeat(64);
    const password = '  mật khẩu dài có dấu 😀  ';
    dom.window.history.replaceState(
      null,
      '',
      `/auth/reset-password#token=${token}`,
    );
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input) =>
        typeof input === 'string' && input.endsWith('/csrf')
          ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
          : new Response(
              JSON.stringify({
                success: true,
                message: 'Mật khẩu đã được đặt lại.',
              }),
            ),
      );
    fetch.mockClear();
    await act(async () => {
      root.render(<AuthRecoveryForm mode="reset-password" />);
    });
    await act(async () => {
      setInput('recovery-password', password);
      setInput('recovery-confirmPassword', 'different long password');
    });
    const form = document.querySelector('form');
    if (!form) throw new Error('Missing reset form');
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'không khớp',
    );
    await act(async () => {
      setInput('recovery-confirmPassword', password);
    });
    await act(async () => {
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/reset-password'),
      expect.objectContaining({
        body: JSON.stringify({ token, password, confirmPassword: password }),
      }),
    );
  });
});

function getInput(id: string): HTMLInputElement {
  const input = document.getElementById(id);
  if (!(input instanceof dom.window.HTMLInputElement))
    throw new Error(`Missing input: ${id}`);
  return input;
}

function setInput(id: string, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    dom.window.HTMLInputElement.prototype,
    'value',
  );
  if (!valueDescriptor?.set) throw new Error('Missing native input setter');
  valueDescriptor.set.call(getInput(id), value);
  getInput(id).dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
