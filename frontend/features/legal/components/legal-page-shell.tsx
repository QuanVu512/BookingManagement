import React from 'react';
import Link from 'next/link';
import { LegalFooter } from './legal-footer';
import styles from './legal.module.css';

interface LegalPageShellProps {
  children: React.ReactNode;
  activePath?: string;
}

export const LegalPageShell: React.FC<LegalPageShellProps> = ({
  children,
  activePath = '/privacy',
}) => {
  return (
    <div className={styles.pageContainer}>
      <header
        style={{
          borderBottom: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
          padding: '1rem 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--surface-card, rgba(17, 24, 39, 0.85))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link
            href="/"
            style={{
              fontWeight: 700,
              fontSize: '1.125rem',
              color: 'var(--ink, #f8fafc)',
              textDecoration: 'none',
              letterSpacing: '-0.01em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            ← SMASH ARENA PICKLEBALL
          </Link>
          <nav aria-label="Điều hướng chính sách" style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
            <Link
              href="/privacy"
              style={{
                color: activePath === '/privacy' ? 'var(--accent-volt, #a3e635)' : 'var(--text-secondary, #94a3b8)',
                textDecoration: activePath === '/privacy' ? 'underline' : 'none',
                fontWeight: activePath === '/privacy' ? 600 : 400,
              }}
            >
              Quyền riêng tư
            </Link>
            <Link
              href="/terms"
              style={{
                color: activePath === '/terms' ? 'var(--accent-volt, #a3e635)' : 'var(--text-secondary, #94a3b8)',
                textDecoration: activePath === '/terms' ? 'underline' : 'none',
                fontWeight: activePath === '/terms' ? 600 : 400,
              }}
            >
              Điều khoản
            </Link>
            <Link
              href="/cookies"
              style={{
                color: activePath === '/cookies' ? 'var(--accent-volt, #a3e635)' : 'var(--text-secondary, #94a3b8)',
                textDecoration: activePath === '/cookies' ? 'underline' : 'none',
                fontWeight: activePath === '/cookies' ? 600 : 400,
              }}
            >
              Cookie
            </Link>
            <Link
              href="/refund-policy"
              style={{
                color: activePath === '/refund-policy' ? 'var(--accent-volt, #a3e635)' : 'var(--text-secondary, #94a3b8)',
                textDecoration: activePath === '/refund-policy' ? 'underline' : 'none',
                fontWeight: activePath === '/refund-policy' ? 600 : 400,
              }}
            >
              Hoàn tiền
            </Link>
          </nav>
        </div>

        <div>
          <Link
            href="/booking"
            style={{
              padding: '0.4rem 0.85rem',
              background: 'var(--button-primary-bg, #166534)',
              color: '#ffffff',
              borderRadius: 'var(--radius-sm, 8px)',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: 600,
            }}
          >
            Đặt sân ngay
          </Link>
        </div>
      </header>

      <main className={styles.mainContent}>{children}</main>

      <LegalFooter />
    </div>
  );
};
