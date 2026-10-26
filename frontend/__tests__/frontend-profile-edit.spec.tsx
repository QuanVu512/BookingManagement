import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { ProfileEditForm } from '../features/account/components/profile-edit-form.js';

// UNVERIFIED (frontend test scope BLOCKED) — authored per plan, not executed.
const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14005',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { createRoot } = await import('react-dom/client');

function render(onSaved: () => void) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <ProfileEditForm
        initialFullName="An"
        initialAvatarUrl={null}
        onSaved={onSaved}
      />,
    );
  });
  return { container, root };
}

function setInput(container: Element, type: string, value: string): void {
  const input = container.querySelector(
    `input[type="${type}"]`,
  ) as HTMLInputElement | null;
  if (!input) throw new Error(`Missing input ${type}`);
  act(() => {
    input.focus();
    dom.window.document.execCommand?.('selectAll', false);
    Object.getOwnPropertyDescriptor(
      dom.window.HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

function clickSave(container: Element): void {
  const button = [...container.querySelectorAll('button')].find((node) =>
    (node.textContent ?? '').includes('Lưu hồ sơ'),
  );
  if (!button) throw new Error('Missing save button');
  act(() => {
    button.click();
  });
}

describe('ProfileEditForm (C12)', () => {
  it('chặn họ tên rỗng phía client, không gọi API', async () => {
    const calls: string[] = [];
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      calls.push(typeof input === 'string' ? input : input.url);
      return new Response('{}', { status: 404 });
    });
    const onSaved = jest.fn();
    const { container, root } = render(onSaved);
    setInput(container, 'text', '   ');
    clickSave(container);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(container.textContent).toContain('1 đến 150 ký tự');
    expect(calls).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  it('từ chối avatar non-http phía client', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('must not fetch');
    });
    const { container, root } = render(jest.fn());
    setInput(container, 'url', 'javascript:alert(1)');
    clickSave(container);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
    });
    expect(container.textContent).toContain('http/https');
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });
});
