import { afterEach, describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { SportyFooter } from '../components/home/sporty-footer.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://127.0.0.1:4001',
});

(dom.window as any).requestIdleCallback =
  (dom.window as any).requestIdleCallback ||
  ((cb: () => void) => setTimeout(() => cb(), 1));
(dom.window as any).cancelIdleCallback =
  (dom.window as any).cancelIdleCallback || ((id: any) => clearTimeout(id));

for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  requestIdleCallback: (dom.window as any).requestIdleCallback,
  cancelIdleCallback: (dom.window as any).cancelIdleCallback,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

const { createRoot } = await import('react-dom/client');

let mountedRoot: ReturnType<typeof createRoot> | undefined;
afterEach(() => {
  act(() => mountedRoot?.unmount());
  mountedRoot = undefined;
  dom.window.document.body.replaceChildren();
});

describe('SportyFooter Layout & Columns', () => {
  it('render đúng cấu trúc hàng cột, mỗi cột tối đa 3 hàng', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);
    mountedRoot = root;

    act(() => {
      root.render(<SportyFooter />);
    });

    const footer = container.querySelector('footer.arena-footer');
    expect(footer).not.toBeNull();
    expect(footer?.getAttribute('aria-label')).toBe('Chân trang hệ thống');

    // Brand info
    const brandTitle = container.querySelector('.arena-footer-brand strong');
    expect(brandTitle?.textContent).toContain('SMASH ARENA PICKLEBALL');

    // Nav columns
    const columns = container.querySelectorAll('.arena-footer-col');
    expect(columns.length).toBe(4);

    // Kiểm tra quy tắc: mỗi cột chỉ chứa tối đa 3 hàng
    columns.forEach((col) => {
      const links = col.querySelectorAll('.arena-footer-col-links > li');
      expect(links.length).toBeGreaterThan(0);
      expect(links.length).toBeLessThanOrEqual(3);
    });

    // Kiểm tra đầy đủ các liên kết chính sách và điều khoản
    const textContent = container.textContent || '';
    expect(textContent).toContain('Trang chủ');
    expect(textContent).toContain('Tiện ích');
    expect(textContent).toContain('Đặt sân');
    expect(textContent).toContain('Lịch của tôi');
    expect(textContent).toContain('Hỗ trợ');
    expect(textContent).toContain('Vị trí cụm sân');
    expect(textContent).toContain('Quyền riêng tư');
    expect(textContent).toContain('Điều khoản');
    expect(textContent).toContain('Hoàn tiền');
    expect(textContent).toContain('Cookie');
    expect(textContent).toContain('Tùy chọn Cookie');
  });
});
