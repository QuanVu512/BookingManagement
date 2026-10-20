'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { UserProfile } from '../../types/auth';
import styles from './account-menu.module.css';

const MENU_LINKS = [
  { label: 'Thông tin cá nhân', href: '/account' },
  { label: 'Bảo mật tài khoản', href: '/account/security' },
  { label: 'Lịch sử đặt sân', href: '/bookings' },
  { label: 'Hóa đơn & thanh toán', href: '/bookings?tab=payments' },
] as const;

export function AccountMenu({
  user,
  onLogout,
}: {
  user: UserProfile;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname() ?? '';

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const handlePointer = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handlePointer);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handlePointer);
    };
  }, [open]);

  const current = (href: string) =>
    href === '/bookings' ? pathname === '/bookings' : pathname === href;

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Mở menu tài khoản của ${user.fullName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {user.fullName.charAt(0).toUpperCase()}
        </span>
        <span className={styles.name}>{user.fullName}</span>
      </button>
      {open && (
        <ul id={menuId} role="menu" className={styles.menu}>
          {MENU_LINKS.map((link) => (
            <li key={link.href} role="none">
              <a
                role="menuitem"
                href={link.href}
                className={styles.item}
                aria-current={current(link.href) ? 'page' : undefined}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </a>
            </li>
          ))}
          <li role="none">
            <button
              type="button"
              role="menuitem"
              className={styles.item}
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              Đăng xuất
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
