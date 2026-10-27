import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import type { UserProfile } from '../types/auth';

const redirected: string[] = [];
jest.unstable_mockModule('next/navigation', () => ({
  usePathname: () => '/account',
  redirect: (url: string) => {
    redirected.push(url);
    throw new Error(`REDIRECT:${url}`);
  },
}));

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
  url: 'http://127.0.0.1:4133',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });

const { createRoot } = await import('react-dom/client');
const { AccountMenu } = await import('../components/account/account-menu.js');
const { AccountProfileView } = await import(
  '../components/account/account-profile-view.js'
);
const { AccountSecurityView } = await import(
  '../components/account/account-security-view.js'
);
const { default: AccountPaymentsPage } = await import(
  '../app/account/payments/page.js'
);

const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const user: UserProfile = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'customer01',
  fullName: 'Nguyen Van A',
  email: 'a@example.com',
  phone: '0901234567',
  roles: ['CUSTOMER'],
  primaryRole: 'CUSTOMER',
  isStaffOrAdmin: false,
};

let root: ReturnType<typeof createRoot>;
const logout = jest.fn();

beforeEach(async () => {
  const container = document.getElementById('app');
  if (!container) throw new Error('Missing DOM root');
  container.innerHTML = '';
  root = createRoot(container);
  logout.mockReset();
});

afterEach(async () => {
  await act(async () => root.unmount());
});

describe('RF-06A account navigation and read-only views', () => {
  it('renders the five-item disclosure menu with native targets', async () => {
    await act(async () => root.render(<AccountMenu user={user} onLogout={logout} />));
    const trigger = document.querySelector('button[aria-haspopup="menu"]');
    expect(trigger?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => (trigger as HTMLButtonElement).click());
    expect(trigger?.getAttribute('aria-expanded')).toBe('true');
    const items = [...document.querySelectorAll('[role="menuitem"]')].map(
      (item) => ({
        text: item.textContent?.trim(),
        href: item.getAttribute('href'),
      }),
    );
    expect(items).toEqual([
      { text: 'Thông tin cá nhân', href: '/account' },
      { text: 'Bảo mật tài khoản', href: '/account/security' },
      { text: 'Quyền riêng tư & Dữ liệu', href: '/account/privacy' },
      { text: 'Lịch sử đặt sân', href: '/bookings' },
      { text: 'Hóa đơn & thanh toán', href: '/bookings?tab=payments' },
      { text: 'Đăng xuất', href: null },
    ]);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe(
      'Thông tin cá nhân',
    );
  });

  it('closes on Escape, restores focus and invokes logout', async () => {
    await act(async () => root.render(<AccountMenu user={user} onLogout={logout} />));
    const trigger = document.querySelector(
      'button[aria-haspopup="menu"]',
    ) as HTMLButtonElement;
    await act(async () => trigger.click());
    await act(async () => {
      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Escape' }),
      );
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
    await act(async () => trigger.click());
    const logoutItem = [...document.querySelectorAll('[role="menuitem"]')].find(
      (item) => item.textContent === 'Đăng xuất',
    ) as HTMLButtonElement;
    await act(async () => logoutItem.click());
    expect(logout).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders real profile fields without non-functional account CTAs', async () => {
    await act(async () => root.render(<AccountProfileView user={user} />));
    const text = document.body.textContent ?? '';
    expect(text).toContain('customer01');
    expect(text).toContain('Nguyen Van A');
    expect(text).toContain('a@example.com');
    expect(text).toContain('0901234567');
    expect(text).toContain('CUSTOMER');
    for (const dead of [
      'Đổi thông tin',
      'Bật 2FA',
      'Xóa tài khoản',
      'Quản lý thiết bị',
    ])
      expect(text).not.toContain(dead);
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });

  it('keeps security read-only and links only the existing recovery flow', async () => {
    await act(async () => root.render(<AccountSecurityView />));
    const links = [...document.querySelectorAll('a')].map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toEqual(['/auth/forgot-password']);
    const text = document.body.textContent ?? '';
    for (const dead of ['Bật 2FA', 'Xóa tài khoản', 'Quản lý thiết bị'])
      expect(text).not.toContain(dead);
  });

  it('redirects /account/payments to the bounded payments tab', () => {
    redirected.length = 0;
    expect(() => AccountPaymentsPage()).toThrow('REDIRECT:/bookings?tab=payments');
    expect(redirected).toEqual(['/bookings?tab=payments']);
  });

  it('removes the duplicate home booking link and stale bookings copy', () => {
    const home = readFileSync(join(frontendRoot, 'app/page.tsx'), 'utf8');
    expect(home).not.toContain('href="/bookings"');
    expect(home).not.toContain('Booking của tôi');
    const bookings = readFileSync(
      join(frontendRoot, 'app/bookings/page.tsx'),
      'utf8',
    );
    expect(bookings).toContain('Lịch sử đặt sân');
    expect(bookings).toContain(
      'Trạng thái đặt sân được cập nhật tự động từ máy chủ.',
    );
    expect(bookings).not.toContain('chưa có thanh toán');
  });
});
