import React from 'react';
import Link from 'next/link';
import { CookiePreferencesTrigger } from './cookie-preferences-trigger';
import styles from './legal-footer.module.css';

interface LegalFooterProps {
  variant?: 'full' | 'compact';
  id?: string;
  className?: string;
}

export const LegalFooter: React.FC<LegalFooterProps> = ({
  variant = 'full',
  id,
  className,
}) => {
  const currentYear = new Date().getFullYear();

  if (variant === 'compact') {
    return (
      <footer id={id} className={`${styles.footer} ${styles.footerCompact} ${className || ''}`} aria-label="Chân trang pháp lý">
        <div className={styles.container}>
          <div className={styles.bottomSection}>
            <div>© {currentYear} SMASH ARENA PICKLEBALL. Bảo lưu mọi quyền.</div>
            <nav className={styles.compactLinks} aria-label="Liên kết pháp lý rút gọn">
              <Link href="/privacy">Quyền riêng tư</Link>
              <Link href="/terms">Điều khoản</Link>
              <Link href="/cookies">Cookie</Link>
              <Link href="/refund-policy">Hoàn tiền</Link>
              <CookiePreferencesTrigger />
            </nav>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer id={id} className={`${styles.footer} ${className || ''}`} aria-label="Chân trang hệ thống">
      <div className={styles.container}>
        <div className={styles.topSection}>
          <div className={styles.brandCol}>
            <div className={styles.brandName}>SMASH ARENA PICKLEBALL</div>
            <p className={styles.brandDesc}>
              Hệ thống đặt sân Pickleball & quản lý lịch thi đấu thể thao trực tuyến SMASH ARENA tiện lợi, an toàn và minh bạch.
            </p>
          </div>

          <div>
            <h3 className={styles.colHeading}>Dịch vụ</h3>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}>
                <Link href="/booking">Đặt sân thể thao</Link>
              </li>
              <li className={styles.linkItem}>
                <Link href="/bookings">Lịch đặt của tôi</Link>
              </li>
              <li className={styles.linkItem}>
                <Link href="/support">Trung tâm hỗ trợ</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={styles.colHeading}>Chính sách</h3>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}>
                <Link href="/terms">Điều khoản dịch vụ</Link>
              </li>
              <li className={styles.linkItem}>
                <Link href="/refund-policy">Chính sách hoàn tiền</Link>
              </li>
              <li className={styles.linkItem}>
                <Link href="/privacy">Quyền riêng tư</Link>
              </li>
              <li className={styles.linkItem}>
                <Link href="/cookies">Chính sách Cookie</Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className={styles.colHeading}>Quyền dữ liệu</h3>
            <ul className={styles.linkList}>
              <li className={styles.linkItem}>
                <Link href="/privacy/requests">Yêu cầu quyền riêng tư</Link>
              </li>
              <li className={styles.linkItem}>
                <Link href="/support">Gửi khiếu nại dịch vụ</Link>
              </li>
              <li className={styles.linkItem}>
                <CookiePreferencesTrigger />
              </li>
            </ul>
          </div>
        </div>

        <div className={styles.bottomSection}>
          <div>
            © {currentYear} SMASH ARENA. Sân đấu & đặt lịch Pickleball trực tuyến.
          </div>
          <div className={styles.compactLinks}>
            <span>Tuân thủ quy định bảo vệ dữ liệu cá nhân (Nghị định 13/2023/NĐ-CP)</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
