'use client';

import React from 'react';
import Link from 'next/link';
import { useCookiePreferences } from '../hooks/use-cookie-preferences';
import styles from './cookie-consent.module.css';

export const CookieBanner: React.FC = () => {
  const { hasDecided, isMounted, acceptAll, rejectOptional, openPreferencesDialog } =
    useCookiePreferences();

  if (!isMounted || hasDecided) {
    return null;
  }

  return (
    <aside
      className={styles.bannerContainer}
      aria-label="Tùy chọn cookie và quyền riêng tư"
      role="region"
    >
      <div className={styles.bannerContent}>
        <div className={styles.bannerText}>
          <div className={styles.bannerTitle}>Chúng tôi tôn trọng quyền riêng tư của bạn</div>
          <p style={{ margin: 0 }}>
            BookingManagement sử dụng các cookie thiết yếu để đảm bảo chức năng đăng nhập, bảo mật và đặt giữ chỗ sân thể thao. Bạn có thể lựa chọn cho phép hoặc từ chối các cookie tùy chọn theo{' '}
            <Link
              href="/cookies"
              style={{ color: 'var(--accent-volt, #a3e635)', textDecoration: 'underline' }}
            >
              Chính sách Cookie
            </Link>
            .
          </p>
        </div>

        <div className={styles.bannerActions}>
          <button
            type="button"
            onClick={acceptAll}
            className={styles.btnAccept}
          >
            Chấp nhận cookie tùy chọn
          </button>
          <button
            type="button"
            onClick={rejectOptional}
            className={styles.btnReject}
          >
            Từ chối cookie tùy chọn
          </button>
          <button
            type="button"
            onClick={openPreferencesDialog}
            className={styles.btnCustomize}
          >
            Tùy chỉnh
          </button>
        </div>
      </div>
    </aside>
  );
};
