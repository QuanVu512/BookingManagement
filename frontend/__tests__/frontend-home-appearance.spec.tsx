import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const dom = new JSDOM('<div id=app></div>', {
  url: 'http://127.0.0.1:14001',
  pretendToBeVisual: true,
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  IS_REACT_ACT_ENVIRONMENT: true,
})) {
  Object.defineProperty(globalThis, name, { value, configurable: true });
}
const { createRoot } = await import('react-dom/client');
const { HeroSection } = await import('../components/home/hero-section');
const { FacilitiesSection } = await import(
  '../components/home/facilities-section'
);
const { ThemeToggle } = await import('../components/theme/theme-toggle');
const { ThemeProvider } = await import('../context/theme-context');
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  dom.window.localStorage.clear();
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing test root');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
});

describe('Homepage appearance controls', () => {
  it('keeps the bulb button accessible and saves both theme choices', async () => {
    await act(async () =>
      root.render(
        <ThemeProvider>
          <ThemeToggle compact />
        </ThemeProvider>,
      ),
    );
    const button = document.querySelector('button');
    expect(button?.querySelector('svg[aria-hidden=true]')).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe(
      'Chuyển sang giao diện tối',
    );
    await act(async () => button?.click());
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(dom.window.localStorage.getItem('smash-arena-theme')).toBe('dark');
    expect(button?.getAttribute('aria-label')).toBe(
      'Chuyển sang giao diện sáng',
    );
    await act(async () => button?.click());
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(dom.window.localStorage.getItem('smash-arena-theme')).toBe('light');
  });

  it('restores a saved dark theme while keeping the compact bulb control', async () => {
    dom.window.localStorage.setItem('smash-arena-theme', 'dark');
    await act(async () =>
      root.render(
        <ThemeProvider>
          <ThemeToggle compact />
        </ThemeProvider>,
      ),
    );
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Chuyển sang giao diện sáng',
    );
    expect(document.querySelector('.theme-bulb')).not.toBeNull();
  });

  it('renders the supplied animated design without fake metrics or the old illusion', async () => {
    await act(async () => root.render(<HeroSection />));
    expect(document.querySelector('.arena-shimmer')?.textContent).toBe(
      'PICKLEBALL',
    );
    expect(document.querySelector('.arena-ping-dot')).not.toBeNull();
    expect(document.querySelector('.hero-illusion')).toBeNull();
    expect(document.querySelector('a[href="/booking"]')?.textContent).toContain(
      'Đặt sân ngay',
    );
    expect(document.querySelectorAll('.arena-hero-stats > div')).toHaveLength(
      4,
    );
    expect(document.body.textContent).not.toContain('500 LUX');
    expect(document.body.textContent).not.toContain('24/7');
  });

  it('renders facilities section with 6 cards and dark glass design', async () => {
    await act(async () => root.render(<FacilitiesSection />));
    const section = document.querySelector('section#facilities');
    expect(section).not.toBeNull();
    const cards = document.querySelectorAll('.arena-facility-card');
    expect(cards).toHaveLength(6);
    expect(document.body.textContent).toContain('Mặt sân');
    expect(document.body.textContent).toContain('Hệ thống chiếu sáng');
    expect(document.body.textContent).toContain('Khu thay đồ');
    expect(document.body.textContent).toContain('Nước uống');
    expect(document.body.textContent).toContain('Khu nghỉ ngơi');
    expect(document.body.textContent).toContain('Bãi đỗ xe');
    expect(document.querySelector('.arena-facility-icon')).toBeNull();
    expect(document.querySelectorAll('.arena-facility-index')).toHaveLength(6);
  });
});
