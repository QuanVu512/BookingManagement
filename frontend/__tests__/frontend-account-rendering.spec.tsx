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

describe('Điều hướng và giao diện tài khoản người dùng (RF-06A: thông tin cá nhân và bảo mật)', () => {
  it('RF-06A (Menu điều hướng): hiển thị menu tài khoản người dùng với các liên kết điều hướng chuẩn', async () => {
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
      { text: 'Lịch sử đơn hàng', href: '/bookings' },
      { text: 'Đăng xuất', href: null },
    ]);
    expect(document.querySelector('[aria-current="page"]')?.textContent).toBe(
      'Thông tin cá nhân',
    );
  });

  it('RF-06A (Thao tác bàn phím): đóng menu khi nhấn phím Escape, trả lại tiêu điểm và kích hoạt đăng xuất đúng', async () => {
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

  it('RF-06A (Hồ sơ cá nhân): hiển thị các trường thông tin cá nhân thật, loại bỏ các nút hành động thừa hoặc thông báo ảo', async () => {
    await act(async () => root.render(<AccountProfileView user={user} />));
    const text = document.body.textContent ?? '';
    expect(text).toContain('customer01');
    expect(text).toContain('Nguyen Van A');
    expect(text).toContain('a@example.com');
    expect(text).toContain('0901234567');
    expect(text).not.toContain('Vai trò');
    for (const dead of [
      'Đổi thông tin',
      'Bật 2FA',
      'Xóa tài khoản',
      'Quản lý thiết bị',
      'Hệ thống chưa hỗ trợ chỉnh sửa hồ sơ trực tiếp',
    ])
      expect(text).not.toContain(dead);
    expect(document.querySelectorAll('button')).toHaveLength(0);
  });

  it('RF-06A (Bảo mật tài khoản): trang bảo mật chỉ hiển thị thông tin và liên kết đến luồng khôi phục tài khoản hiện có', async () => {
    await act(async () => root.render(<AccountSecurityView />));
    const links = [...document.querySelectorAll('a')].map((link) =>
      link.getAttribute('href'),
    );
    expect(links).toEqual(['/auth/forgot-password']);
    const text = document.body.textContent ?? '';
    for (const dead of ['Bật 2FA', 'Xóa tài khoản', 'Quản lý thiết bị'])
      expect(text).not.toContain(dead);
  });

  it('RF-06A (Chuyển hướng đường dẫn): chuyển hướng đường dẫn /account/payments sang đúng tab lịch sử thanh toán', () => {
    redirected.length = 0;
    expect(() => AccountPaymentsPage()).toThrow('REDIRECT:/bookings?tab=payments');
    expect(redirected).toEqual(['/bookings?tab=payments']);
  });

  it('RF-06A (Dọn dẹp liên kết): loại bỏ liên kết đặt sân trùng lặp ở trang chủ và văn bản cũ không còn áp dụng', () => {
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
