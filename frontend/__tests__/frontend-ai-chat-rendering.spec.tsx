import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';

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
const pushMock = jest.fn<(...args: Array<unknown>) => void>();
jest.unstable_mockModule('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));
const { createRoot } = await import('react-dom/client');
const { ChatWidget } =
  await import('../features/ai-assistant/components/ChatWidget.js');

const STATIC_REPLY =
  'Phí hủy bằng 10% giá thuê sân, trừ vào tiền cọc đã thu và hoàn lại phần còn lại.';

function mockFetchOnce() {
  const fetchMock = jest.fn<() => Promise<unknown>>(async () => ({
    ok: true,
    json: async () => ({
      success: true,
      data: {
        replyText: STATIC_REPLY,
        reservationId: 'res-test',
        fromKnowledge: true,
      },
    }),
  }));
  Object.defineProperty(globalThis, 'fetch', {
    value: fetchMock,
    configurable: true,
  });
  return fetchMock;
}

describe('ai chat widget', () => {
  afterEach(() => {
    document.getElementById('app')!.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('hiện FAB, mở khung chat khi bấm và đóng bằng Escape', async () => {
    const root = createRoot(document.getElementById('app')!);
    await act(async () => {
      root.render(<ChatWidget />);
    });
    const fab = document.querySelector('[data-testid="ai-chat-fab"]');
    expect(fab).not.toBeNull();
    expect(document.querySelector('[data-testid="ai-chat-widget"]')).toBeNull();

    await act(async () => {
      (fab as HTMLButtonElement).click();
    });
    expect(
      document.querySelector('[data-testid="ai-chat-widget"]'),
    ).not.toBeNull();
    expect(fab?.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      window.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape' }),
      );
    });
    expect(document.querySelector('[data-testid="ai-chat-widget"]')).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });

  it('gửi câu hỏi và hiển thị câu trả lời tĩnh', async () => {
    const fetchMock = mockFetchOnce();
    const root = createRoot(document.getElementById('app')!);
    await act(async () => {
      root.render(<ChatWidget />);
    });
    await act(async () => {
      (
        document.querySelector(
          '[data-testid="ai-chat-fab"]',
        ) as HTMLButtonElement
      ).click();
    });
    const input = document.getElementById('ai-chat-input') as HTMLInputElement;
    await act(async () => {
      const valueProperty = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value',
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const setNativeValue = valueProperty?.set;
      setNativeValue?.call(input, 'chính sách hủy sân thế nào?');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      const form = document.querySelector(
        '[data-testid="ai-chat-widget"] form',
      ) as HTMLFormElement;
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toMatch('Phí hủy bằng 10%');
    await act(async () => {
      root.unmount();
    });
  });

  it('hiển thị card gợi ý sân và điều hướng khi bấm đặt', async () => {
    const deepLink =
      '/courts/court-1?startsAt=2026-10-29T19%3A00%3A00%2B07%3A00&endsAt=x';
    const fetchMock = jest.fn<() => Promise<unknown>>(async () => ({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          replyText: 'Đã kiểm tra 5 sân đầu tiên, có 1 sân còn trống.',
          reservationId: 'res-stage2',
          fromKnowledge: false,
          suggestions: [
            {
              courtId: 'court-1',
              courtName: 'Sân 1',
              courtType: 'STANDARD',
              totalAmount: 100000,
              currency: 'VND',
              available: true,
              deepLink,
              imageUrl: '/courts/court-3.jpg',
            },
          ],
        },
      }),
    }));
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
    });
    const root = createRoot(document.getElementById('app')!);
    await act(async () => {
      root.render(<ChatWidget />);
    });
    await act(async () => {
      (
        document.querySelector(
          '[data-testid="ai-chat-fab"]',
        ) as HTMLButtonElement
      ).click();
    });
    const input = document.getElementById('ai-chat-input') as HTMLInputElement;
    await act(async () => {
      const valueProperty = Object.getOwnPropertyDescriptor(
        dom.window.HTMLInputElement.prototype,
        'value',
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const setNativeValue = valueProperty?.set;
      setNativeValue?.call(input, 'đặt sân 19h tối mai, chơi 2 tiếng');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => {
      const form = document.querySelector(
        '[data-testid="ai-chat-widget"] form',
      ) as HTMLFormElement;
      form.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(document.body.textContent).toMatch('Sân 1');
    const actionButton = Array.from(
      document.querySelectorAll('[data-testid="ai-chat-widget"] button'),
    ).find(
      (button) => button.textContent === 'Xem & Đặt sân này',
    ) as HTMLButtonElement;
    await act(async () => {
      actionButton.click();
    });
    expect(pushMock).toHaveBeenCalledWith(deepLink);
    expect(document.querySelector('[data-testid="ai-chat-widget"]')).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });
});
