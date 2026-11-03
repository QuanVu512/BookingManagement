import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://127.0.0.1:4001/booking/lookup',
});

for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

const { createRoot } = await import('react-dom/client');
const { GuestLookupForm } = await import(
  '../features/payment/components/guest-lookup-form.js'
);

const GENERIC_MESSAGE =
  'Nếu có đơn giữ chỗ còn hạn, chúng tôi đã gửi liên kết tới email đăng ký.';

function mount() {
  const container = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<GuestLookupForm />);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function setInput(el: HTMLInputElement, value: string) {
  act(() => {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const setter = Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    el.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('GuestLookupForm (tra cứu chống dò AC-22)', () => {
  beforeEach(() => {
    delete (globalThis as any).fetch;
  });

  it('gửi tra cứu và hiển thị đúng thông báo chung của máy chủ', async () => {
    (globalThis as any).fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
      if (String(url).includes('/api/auth/csrf')) {
        return new Response(JSON.stringify({ token: 'a'.repeat(64) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      expect(String(url)).toContain('/api/guest/bookings/lookup');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(init?.body ?? '{}')).toEqual({ contact: 'a@example.com' });
      return new Response(JSON.stringify({ success: true, message: GENERIC_MESSAGE }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      });
    });
    const mounted = mount();
    setInput(
      mounted.container.querySelector('input[name="contact"]') as HTMLInputElement,
      'a@example.com',
    );
    const form = mounted.container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    await flush();
    const note = mounted.container.querySelector('[aria-live="polite"]');
    expect(note?.textContent).toBe(GENERIC_MESSAGE);
    mounted.unmount();
  });

  it('lỗi mạng hiển thị thông báo lỗi, không lộ thông tin đơn', async () => {
    (globalThis as any).fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/api/auth/csrf')) {
        return new Response(JSON.stringify({ token: 'a'.repeat(64) }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error('mất mạng');
    });
    const mounted = mount();
    setInput(
      mounted.container.querySelector('input[name="contact"]') as HTMLInputElement,
      '0912345678',
    );
    const form = mounted.container.querySelector('form') as HTMLFormElement;
    act(() => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    await flush();
    expect(mounted.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(mounted.container.textContent).not.toContain('BK-');
    mounted.unmount();
  });
});
