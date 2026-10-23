import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
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
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}
const router = { push: jest.fn(), prefetch: jest.fn() };
jest.unstable_mockModule('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/',
}));
const { createRoot } = await import('react-dom/client');
const { AuthProvider, useAuth } = await import('../context/auth-context.js');
const { ThemeProvider } = await import('../context/theme-context.js');
const { SportyHeader } = await import('../components/home/sporty-header.js');
const { AuthPage } = await import('../components/auth/auth-page.js');
const { EmailVerificationPage } =
  await import('../components/auth/email-verification-page.js');
const { AuthRecoveryForm } =
  await import('../components/auth/auth-recovery-form.js');

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

describe('Auth pages and session rendering', () => {
  beforeEach(async () => {
    router.push.mockClear();
    dom.window.sessionStorage.clear();
    dom.window.localStorage.clear();
    dom.window.history.replaceState(null, '', '/');
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
            <AuthPage mode="login" />
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

  it('navigates from the sign-in action without opening a popup or rerendering Header', async () => {
    await act(async () => getControls().openSignIn());
    expect(router.push).toHaveBeenCalledWith('/auth/login?next=%2F');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(headerCommits).toBe(0);
  });

  it('keeps guest continuation available and returns to the selected destination', async () => {
    dom.window.history.replaceState(null, '', '/auth/login?next=%2Fbookings');
    const guest = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Tiếp tục không cần tài khoản',
    );
    if (!guest) throw new Error('Missing guest option');
    await act(async () => guest.click());
    const proceed = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Tiếp tục xem sân',
    );
    if (!proceed) throw new Error('Missing guest confirmation');
    await act(async () => proceed.click());
    expect(getControls().guestSessionActive).toBe(true);
    expect(router.push).toHaveBeenLastCalledWith('/bookings');
  });

  it('focuses the first input when the login page mounts', async () => {
    await act(async () => getControls().openSignIn());
    expect(document.activeElement?.id).toBe('auth-username');
    expect(headerCommits).toBe(0);
  });

  it('starts empty and keeps the real recovery and registration links', () => {
    expect(getInput('auth-username').value).toBe('');
    expect(getInput('auth-password').value).toBe('');
    expect(
      document.querySelector('a[href="/auth/forgot-password"]'),
    ).not.toBeNull();
    expect(
      document.querySelector('a[href="/auth/register?next=%2F"]'),
    ).not.toBeNull();
    expect(document.querySelector('canvas[aria-hidden="true"]')).not.toBeNull();
  });

  it('restores a saved identifier without restoring any password', async () => {
    dom.window.localStorage.setItem(
      'smash-arena:login-identifier',
      'restored-fixture',
    );
    await act(async () =>
      root.render(
        <ThemeProvider>
          <AuthProvider>
            <ObservedHeader />
            <ControlsProbe />
            <AuthPage mode="login" key="restore-preferences" />
          </AuthProvider>
        </ThemeProvider>,
      ),
    );
    expect(getInput('auth-username').value).toBe('restored-fixture');
    expect(getInput('auth-password').value).toBe('');
    expect(
      document.querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.checked,
    ).toBe(true);
  });

  it('toggles password visibility without changing the password', async () => {
    await act(async () => setInput('auth-password', 'local-only-fixture'));
    const toggle = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Hiện mật khẩu"]',
    );
    if (!toggle) throw new Error('Missing password toggle');
    await act(async () => toggle.click());
    expect(getInput('auth-password').type).toBe('text');
    expect(getInput('auth-password').value).toBe('local-only-fixture');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await act(async () => toggle.click());
    expect(getInput('auth-password').type).toBe('password');
  });

  it('stores only the opted-in identifier and clears it when unchecked', async () => {
    const key = 'smash-arena:login-identifier';
    const checkbox = document.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const form = document.querySelector('form');
    if (!checkbox || !form) throw new Error('Missing login preferences');
    expect(checkbox.checked).toBe(false);
    await act(async () => {
      setInput('auth-username', 'remembered-fixture');
      setInput('auth-password', 'never-store-this-password');
      checkbox.click();
    });
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    expect(dom.window.localStorage.getItem(key)).toBe('remembered-fixture');
    expect(JSON.stringify(dom.window.localStorage)).not.toContain(
      'never-store-this-password',
    );
    await act(async () => checkbox.click());
    await act(async () =>
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      ),
    );
    expect(dom.window.localStorage.getItem(key)).toBeNull();
  });

  it('keeps callbacks stable across modal and guest changes', async () => {
    const initial = getControls();
    await act(async () => initial.openSignIn());
    await act(async () => getControls().openGuestConfirm());
    expect(getControls().isGuestConfirmOpen).toBe(true);
    await act(async () => getControls().proceedAsGuest());
    expect(getControls().guestSessionActive).toBe(true);
    expect(getControls().isGuestConfirmOpen).toBe(false);
    for (const name of [
      'openSignIn',
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
    await act(async () => getControls().openSignIn());
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
    await act(async () => getControls().openSignIn());
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      typeof input === 'string' && input.endsWith('/csrf')
        ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
        : new Response(
            JSON.stringify({
              success: true,
              status: 'verification_required',
              verificationToken: 'b'.repeat(64),
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
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('unlocks form loading after an auth timeout', async () => {
    await act(async () => getControls().openSignIn());
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

  it('removes the email verification link from login', () => {
    expect(document.querySelector('a[href="/auth/verify-email"]')).toBeNull();
    expect(
      document.querySelector('a[href="/auth/forgot-password"]'),
    ).not.toBeNull();
  });

  it('redirects an unverified login to OTP using the server recipient for a username login', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      typeof input === 'string' && input.endsWith('/csrf')
        ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
        : new Response(
            JSON.stringify({
              code: 'EMAIL_VERIFICATION_REQUIRED',
              message: 'Verify email',
              verification: {
                email: 'customer@example.com',
                token: 'b'.repeat(64),
              },
            }),
            { status: 401 },
          ),
    );
    await act(async () => {
      setInput('auth-username', 'customer01');
      setInput('auth-password', 'long password phrase');
    });
    await submitForm();
    expect(router.push).toHaveBeenLastCalledWith('/auth/verify-email?next=%2F');
    expect(
      JSON.parse(
        dom.window.sessionStorage.getItem('booking:verification-flow') ?? '{}',
      ),
    ).toEqual({ email: 'customer@example.com', token: 'b'.repeat(64) });
    expect(getControls().isAuthenticated).toBe(false);
  });

  it('auto-sends once in StrictMode, fades the notice at four seconds and enables resend at ten', async () => {
    jest.useFakeTimers();
    try {
      storeVerificationFlow();
      const fetch = mockOtpDelivery();
      await act(async () =>
        root.render(
          <StrictMode>
            <EmailVerificationPage />
          </StrictMode>,
        ),
      );
      const deliveries = () =>
        fetch.mock.calls.filter(
          ([input]) =>
            typeof input === 'string' && input.endsWith('/resend-verification'),
        );
      expect(deliveries()).toHaveLength(1);
      expect(document.querySelector('[role="status"]')?.textContent).toBe(
        'OTP đã được gửi thành công.',
      );
      expect(document.querySelector('[role="status"] button')).toBeNull();
      const resend = document.querySelector('button.resend');
      if (!(resend instanceof dom.window.HTMLButtonElement))
        throw new Error('Missing resend');
      expect(resend.disabled).toBe(true);
      expect(resend.textContent).toBe('Gửi lại sau 10s');
      await act(async () => {
        jest.advanceTimersByTime(3999);
      });
      expect(document.querySelector('[role="status"]')).not.toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(document.querySelector('[role="status"]')).toBeNull();
      expect(resend.disabled).toBe(true);
      await act(async () => {
        jest.advanceTimersByTime(6000);
      });
      expect(resend.disabled).toBe(false);
      await act(async () => resend.click());
      expect(deliveries()).toHaveLength(2);
      expect(resend.textContent).toBe('Gửi lại sau 10s');
      expect(document.querySelector('[role="status"]')).not.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows an error without a success notice when automatic OTP delivery fails', async () => {
    storeVerificationFlow();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      typeof input === 'string' && input.endsWith('/csrf')
        ? new Response(JSON.stringify({ token: 'a'.repeat(64) }))
        : new Response(JSON.stringify({ message: 'Chưa thể gửi mã OTP.' }), {
            status: 503,
          }),
    );
    await act(async () =>
      root.render(
        <StrictMode>
          <EmailVerificationPage />
        </StrictMode>,
      ),
    );
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      'Chưa thể gửi mã OTP.',
    );
    expect(
      document.querySelector('button.resend')?.hasAttribute('disabled'),
    ).toBe(false);
  });

  it('verifies the six-digit OTP only on explicit submit and preserves leading zeros', async () => {
    dom.window.sessionStorage.setItem(
      'booking:verification-email',
      'customer@example.com',
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
    await act(async () =>
      root.render(
        <StrictMode>
          <EmailVerificationPage />
        </StrictMode>,
      ),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(getInput('verification-email').value).toBe('customer@example.com');
    await act(async () => pasteOtp(0, '001234'));
    await submitForm();
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/verify-email'),
      expect.objectContaining({
        body: JSON.stringify({ email: 'customer@example.com', code: '001234' }),
      }),
    );
    expect(document.querySelector('form')).toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'đã được xác minh',
    );
    expect(document.body.textContent).toContain('Tiếp tục đăng nhập');
  });

  it('shows red-associated password errors while editing and removes them when valid', async () => {
    await act(async () =>
      root.render(
        <AuthProvider>
          <AuthPage key="register-validation" mode="register" />
        </AuthProvider>,
      ),
    );
    expect(document.getElementById('auth-password-error')).toBeNull();
    expect(document.body.textContent).not.toContain('12–128');
    await act(async () => setInput('auth-password', 'abcdef'));
    expect(getInput('auth-password').getAttribute('aria-invalid')).toBe('true');
    expect(getInput('auth-password').getAttribute('aria-describedby')).toBe(
      'auth-password-error',
    );
    expect(
      document.getElementById('auth-password-error')?.textContent,
    ).toContain('dài hơn 6 ký tự');
    await act(async () => setInput('auth-password', '1234567'));
    expect(
      document.getElementById('auth-password-error')?.textContent,
    ).toContain('một chữ cái');
    await act(async () => setInput('auth-password', 'abc1234'));
    expect(getInput('auth-password').getAttribute('aria-invalid')).toBe(
      'false',
    );
    expect(document.getElementById('auth-password-error')).toBeNull();
    await act(async () => setInput('auth-confirmPassword', 'abc1235'));
    expect(getInput('auth-confirmPassword').getAttribute('aria-invalid')).toBe(
      'true',
    );
    await act(async () => setInput('auth-confirmPassword', 'abc1234'));
    expect(document.getElementById('auth-confirmPassword-error')).toBeNull();
  });

  it('renders six single-digit boxes with automatic focus and keyboard editing', async () => {
    await act(async () => root.render(<EmailVerificationPage />));
    expect(document.body.textContent).not.toContain(
      'Nhập mã OTP gồm 6 chữ số được gửi đến email của bạn.',
    );
    expect(document.body.textContent).toContain(
      'Mã hết hạn sau 5 phút hoặc khi mã mới được tạo.',
    );
    expect(document.querySelectorAll('[data-otp-digit]')).toHaveLength(6);
    for (let index = 0; index < 6; index++) {
      expect(getInput(`verification-code-${index}`).maxLength).toBe(1);
      expect(getInput(`verification-code-${index}`).inputMode).toBe('numeric');
      expect(
        getInput(`verification-code-${index}`).getAttribute('aria-label'),
      ).toBe(`Chữ số ${index + 1} trên 6`);
    }
    await act(async () => setInput('verification-code-0', '0'));
    expect(document.activeElement?.id).toBe('verification-code-1');
    await act(async () => setInput('verification-code-1', '7'));
    expect(document.activeElement?.id).toBe('verification-code-2');
    await act(async () => setInput('verification-code-2', 'x'));
    expect(getInput('verification-code-2').value).toBe('');
    await act(async () => pressOtpKey(2, 'Backspace'));
    expect(getInput('verification-code-1').value).toBe('');
    expect(document.activeElement?.id).toBe('verification-code-1');
    await act(async () => pressOtpKey(1, 'ArrowLeft'));
    expect(document.activeElement?.id).toBe('verification-code-0');
    await act(async () => pressOtpKey(0, 'End'));
    expect(document.activeElement?.id).toBe('verification-code-5');
  });

  it('fills a complete pasted OTP from any box and distributes partial pastes without shifting positions', async () => {
    await act(async () => root.render(<EmailVerificationPage />));
    await act(async () => pasteOtp(3, '001 234'));
    expect(otpValues()).toEqual(['0', '0', '1', '2', '3', '4']);
    expect(document.activeElement?.id).toBe('verification-code-5');
    await act(async () => pasteOtp(2, '98'));
    expect(otpValues()).toEqual(['0', '0', '9', '8', '3', '4']);
    expect(document.activeElement?.id).toBe('verification-code-4');
    await act(async () => setInput('verification-code-2', ''));
    expect(otpValues()).toEqual(['0', '0', '', '8', '3', '4']);
    await act(async () => pasteOtp(5, '76'));
    expect(otpValues()).toEqual(['0', '0', '', '8', '3', '7']);
  });

  it('accepts a full autofilled code and ignores pasted text without digits', async () => {
    await act(async () => root.render(<EmailVerificationPage />));
    await act(async () => setInput('verification-code-0', '908172'));
    expect(otpValues()).toEqual(['9', '0', '8', '1', '7', '2']);
    await act(async () => pasteOtp(0, 'letters only'));
    expect(otpValues()).toEqual(['9', '0', '8', '1', '7', '2']);
  });

  it('moves successful registration to verification while retaining the booking destination', async () => {
    dom.window.history.replaceState(
      null,
      '',
      '/auth/register?next=%2Fcourts%2Fcourt-1',
    );
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (typeof input === 'string' && input.endsWith('/me'))
        return new Response('{}', { status: 401 });
      return new Response(
        JSON.stringify(
          typeof input === 'string' && input.endsWith('/csrf')
            ? { token: 'a'.repeat(64) }
            : {
                success: true,
                status: 'verification_required',
                verificationToken: 'b'.repeat(64),
                message: 'Kiểm tra email.',
              },
        ),
      );
    });
    await act(async () =>
      root.render(
        <AuthProvider>
          <ControlsProbe />
          <AuthPage key="register" mode="register" />
        </AuthProvider>,
      ),
    );
    await act(async () => {
      for (const [field, value] of Object.entries({
        username: 'customer01',
        fullName: 'Customer',
        email: 'customer@example.com',
        phone: '0912345678',
        password: 'long password phrase',
        confirmPassword: 'long password phrase',
      }))
        setInput(`auth-${field}`, value);
    });
    await submitForm();
    expect(router.push).toHaveBeenLastCalledWith(
      '/auth/verify-email?next=%2Fcourts%2Fcourt-1',
    );
    expect(
      dom.window.sessionStorage.getItem('booking:verification-email'),
    ).toBe('customer@example.com');
    expect(getControls().isAuthenticated).toBe(false);
  });

  it('blocks invalid OTP before HTTP and permits resend after an error', async () => {
    await act(async () => root.render(<EmailVerificationPage />));
    const fetch = jest.spyOn(globalThis, 'fetch');
    fetch.mockClear();
    await act(async () => {
      setInput('verification-email', 'customer@example.com');
      pasteOtp(0, '123');
    });
    await submitForm();
    expect(fetch).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      '6 chữ số',
    );
    storeVerificationFlow();
    fetch.mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            typeof input === 'string' && input.endsWith('/csrf')
              ? { token: 'a'.repeat(64) }
              : {
                  success: true,
                  message: 'OTP đã được gửi thành công.',
                },
          ),
        ),
    );
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent === 'Gửi lại mã OTP',
    );
    if (!button) throw new Error('Missing resend control');
    await act(async () => button.click());
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/resend-verification'),
      expect.objectContaining({
        body: JSON.stringify({
          email: 'customer@example.com',
          verificationToken: 'b'.repeat(64),
        }),
      }),
    );
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Gửi lại sau');
    expect(otpValues()).toEqual(['', '', '', '', '', '']);
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

async function submitForm() {
  const form = document.querySelector('form');
  if (!form) throw new Error('Missing form');
  await act(async () =>
    form.dispatchEvent(
      new dom.window.Event('submit', { bubbles: true, cancelable: true }),
    ),
  );
}

function pasteOtp(index: number, text: string) {
  const event = new dom.window.Event('paste', {
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: () => text },
  });
  getInput(`verification-code-${index}`).dispatchEvent(event);
}

function pressOtpKey(index: number, key: string) {
  getInput(`verification-code-${index}`).dispatchEvent(
    new dom.window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function otpValues() {
  return Array.from(
    { length: 6 },
    (_, index) => getInput(`verification-code-${index}`).value,
  );
}

function storeVerificationFlow() {
  dom.window.sessionStorage.setItem(
    'booking:verification-flow',
    JSON.stringify({ email: 'customer@example.com', token: 'b'.repeat(64) }),
  );
}
function mockOtpDelivery() {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            typeof input === 'string' && input.endsWith('/csrf')
              ? { token: 'a'.repeat(64) }
              : { success: true, message: 'OTP đã được gửi thành công.' },
          ),
        ),
    )
    .mockClear();
}
