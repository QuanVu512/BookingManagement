'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCookiePreferences } from '../hooks/use-cookie-preferences';
import styles from './cookie-consent.module.css';

export const CookiePreferencesDialog: React.FC = () => {
  const {
    isMounted,
    isDialogOpen,
    closePreferencesDialog,
    preferences,
    saveCustomPreferences,
    revokePreferences,
  } = useCookiePreferences();

  const [prefChecked, setPrefChecked] = useState(preferences.preferences);
  const [analyticsChecked, setAnalyticsChecked] = useState(preferences.analytics);
  const [marketingChecked, setMarketingChecked] = useState(preferences.marketing);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isDialogOpen) {
      setPrefChecked(preferences.preferences);
      setAnalyticsChecked(preferences.analytics);
      setMarketingChecked(preferences.marketing);
      closeButtonRef.current?.focus();
    }
  }, [isDialogOpen, preferences]);

  useEffect(() => {
    if (!isDialogOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closePreferencesDialog();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen, closePreferencesDialog]);

  if (!isMounted || !isDialogOpen) {
    return null;
  }

  const handleSave = () => {
    saveCustomPreferences({
      preferences: prefChecked,
      analytics: analyticsChecked,
      marketing: marketingChecked,
    });
  };

  const handleRevoke = () => {
    revokePreferences();
  };

  return (
    <div
      className={styles.dialogOverlay}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) closePreferencesDialog();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-dialog-title"
        aria-describedby="cookie-dialog-desc"
        className={styles.dialogCard}
      >
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="cookie-dialog-title" className={styles.dialogTitle}>
              Trung tâm tùy chọn quyền riêng tư và Cookie
            </h2>
            <p id="cookie-dialog-desc" className={styles.dialogSubtitle}>
              Tùy chỉnh các danh mục cookie theo mong muốn của bạn. Cookie thiết yếu luôn hoạt động để đảm bảo hệ thống đặt sân hoạt động an toàn. Xem thêm{' '}
              <Link href="/cookies" style={{ color: 'var(--accent-volt, #a3e635)', textDecoration: 'underline' }}>
                Chính sách Cookie
              </Link>
              .
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            onClick={closePreferencesDialog}
            aria-label="Đóng bảng tùy chọn"
          >
            ×
          </button>
        </div>

        <div className={styles.dialogBody}>
          <div className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <span className={styles.categoryTitle}>Cookie thiết yếu (Necessary)</span>
              <span className={styles.toggleSwitch} style={{ color: 'var(--accent-volt, #a3e635)' }}>
                Luôn hoạt động
              </span>
            </div>
            <p className={styles.categoryDesc}>
              Bắt buộc để duy trì phiên đăng nhập, chống giả mạo yêu cầu (CSRF token) và thực hiện các giao dịch đặt giữ chỗ 5 phút. Không thể tắt nhóm này.
            </p>
          </div>

          <div className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <label htmlFor="pref-toggle" className={styles.categoryTitle} style={{ cursor: 'pointer' }}>
                Tùy chọn hiển thị (Preferences)
              </label>
              <label className={styles.toggleSwitch}>
                <input
                  id="pref-toggle"
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={prefChecked}
                  onChange={(e) => setPrefChecked(e.target.checked)}
                />
                <span>{prefChecked ? 'Bật' : 'Tắt'}</span>
              </label>
            </div>
            <p className={styles.categoryDesc}>
              Cho phép hệ thống ghi nhớ tùy chọn giao diện sáng/tối và thông tin đăng nhập khi bạn chủ động yêu cầu ghi nhớ.
            </p>
          </div>

          <div className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <label htmlFor="analytics-toggle" className={styles.categoryTitle} style={{ cursor: 'pointer' }}>
                Thống kê phân tích (Analytics)
              </label>
              <label className={styles.toggleSwitch}>
                <input
                  id="analytics-toggle"
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={analyticsChecked}
                  onChange={(e) => setAnalyticsChecked(e.target.checked)}
                />
                <span>{analyticsChecked ? 'Bật' : 'Tắt'}</span>
              </label>
            </div>
            <p className={styles.categoryDesc}>
              Giúp đo lường hiệu năng và trải nghiệm người dùng. Hiện tại hệ thống không nạp bất kỳ mã theo dõi phân tích nào của bên thứ ba.
            </p>
          </div>

          <div className={styles.categoryCard}>
            <div className={styles.categoryHeader}>
              <label htmlFor="marketing-toggle" className={styles.categoryTitle} style={{ cursor: 'pointer' }}>
                Tiếp thị & Quảng cáo (Marketing)
              </label>
              <label className={styles.toggleSwitch}>
                <input
                  id="marketing-toggle"
                  type="checkbox"
                  className={styles.toggleInput}
                  checked={marketingChecked}
                  onChange={(e) => setMarketingChecked(e.target.checked)}
                />
                <span>{marketingChecked ? 'Bật' : 'Tắt'}</span>
              </label>
            </div>
            <p className={styles.categoryDesc}>
              Dành cho các chiến dịch quảng cáo và đo lường chuyển đổi. Mặc định luôn tắt.
            </p>
          </div>
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="button"
            onClick={handleRevoke}
            className={styles.btnCustomize}
            style={{ marginRight: 'auto' }}
          >
            Rút lại toàn bộ tùy chọn
          </button>
          <button
            type="button"
            onClick={closePreferencesDialog}
            className={styles.btnReject}
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            className={styles.btnAccept}
          >
            Lưu lựa chọn
          </button>
        </div>
      </div>
    </div>
  );
};
