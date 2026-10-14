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
import { act } from 'react';

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
      setInput('auth-password', 'Secret1!');
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
      .mockResolvedValue(new Response(JSON.stringify({ success: true, user })));
    await act(async () => {
      await getControls().login('perfuser01', 'Secret1!');
    });
    expect(getControls().user).toEqual(user);
    expect(headerCommits).toBeGreaterThan(0);
    expect(getControls().login).toBe(initial.login);
    expect(getControls().logout).toBe(initial.logout);
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
