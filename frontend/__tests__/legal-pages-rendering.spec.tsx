import { describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { PolicyDocument } from '../features/legal/components/policy-document.js';
import { LegalFooter } from '../features/legal/components/legal-footer.js';
import { TransactionTerms } from '../features/legal/components/transaction-terms.js';
import { CookiePreferencesProvider } from '../features/cookie-consent/components/cookie-preferences-provider.js';
import privacyDoc from '../content/legal/vi/privacy/v1.0.json';
import termsDoc from '../content/legal/vi/terms/v1.0.json';
import refundDoc from '../content/legal/vi/refund-policy/v1.0.json';
import type { PolicyDocument as PolicyDocType } from '../features/legal/model/policy-document.js';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://127.0.0.1:4001',
});

(dom.window as any).requestIdleCallback =
  (dom.window as any).requestIdleCallback || ((cb: () => void) => setTimeout(() => cb(), 1));
(dom.window as any).cancelIdleCallback =
  (dom.window as any).cancelIdleCallback || ((id: any) => clearTimeout(id));

for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  localStorage: dom.window.localStorage,
  requestIdleCallback: (dom.window as any).requestIdleCallback,
  cancelIdleCallback: (dom.window as any).cancelIdleCallback,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}

const { createRoot } = await import('react-dom/client');

describe('Legal Pages & Components Rendering (Phase 1 & 2)', () => {
  it('T01-1: render đúng cấu trúc semantic HTML của trang Privacy', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<PolicyDocument document={privacyDoc as PolicyDocType} />);
    });

    const article = container.querySelector('article');
    expect(article).not.toBeNull();
    expect(article?.getAttribute('aria-labelledby')).toBe('policy-main-heading');

    const h1 = container.querySelector('h1#policy-main-heading');
    expect(h1?.textContent).toContain('Chính sách quyền riêng tư');

    const time = container.querySelector('time');
    expect(time).not.toBeNull();
    expect(time?.getAttribute('dateTime')).toBe(privacyDoc.effectiveAt);

    const sections = container.querySelectorAll('section');
    expect(sections.length).toBeGreaterThanOrEqual(5);

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('T01-2: render đúng cấu trúc semantic HTML của trang Terms và Refund Policy', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<PolicyDocument document={termsDoc as PolicyDocType} />);
    });
    expect(container.textContent).toContain('Thời gian giữ chỗ (Hold)');
    expect(container.textContent).toContain('5 phút');

    act(() => {
      root.render(<PolicyDocument document={refundDoc as PolicyDocType} />);
    });
    expect(container.textContent).toContain('Hủy trước giờ bắt đầu trên 12 tiếng');
    expect(container.textContent).toContain('10%');
    expect(container.textContent).toContain('30%');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('T01-3: LegalFooter render đủ 4 liên kết pháp lý và trigger cookie', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CookiePreferencesProvider>
          <LegalFooter variant="full" />
        </CookiePreferencesProvider>,
      );
    });

    const footer = container.querySelector('footer');
    expect(footer).not.toBeNull();
    expect(footer?.getAttribute('aria-label')).toBe('Chân trang hệ thống');

    const links = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(links).toContain('/privacy');
    expect(links).toContain('/terms');
    expect(links).toContain('/cookies');
    expect(links).toContain('/refund-policy');
    expect(links).toContain('/support');
    expect(links).toContain('/privacy/requests');

    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('T04-1: TransactionTerms hiển thị tóm tắt và yêu cầu người dùng xác nhận', () => {
    const container = dom.window.document.createElement('div');
    dom.window.document.body.appendChild(container);
    const root = createRoot(container);
    let accepted = false;

    act(() => {
      root.render(
        <TransactionTerms
          accepted={accepted}
          onAcceptanceChange={(val) => {
            accepted = val;
          }}
        />,
      );
    });

    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);

    expect(container.textContent).toContain('5 phút');
    expect(container.textContent).toContain('10%');
    expect(container.textContent).toContain('30%');

    act(() => {
      checkbox.click();
    });
    expect(accepted).toBe(true);

    act(() => {
      root.unmount();
    });
    container.remove();
  });
});
