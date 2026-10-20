'use client';

import styles from './account-shell.module.css';

export function AccountSecurityView() {
  return (
    <section className={styles.panel} aria-labelledby="security-heading">
      <h2 id="security-heading">Bảo mật tài khoản</h2>
      <dl className={styles.grid}>
        <dt>Phiên đăng nhập</dt>
        <dd>Được quản lý và kiểm tra bởi máy chủ.</dd>
        <dt>Đổi mật khẩu</dt>
        <dd>
          Dùng luồng đặt lại mật khẩu qua email.{' '}
          <a href="/auth/forgot-password">Đặt lại mật khẩu</a>
        </dd>
      </dl>
      <p className={styles.note}>
        Xác thực hai lớp, quản lý thiết bị và xóa tài khoản chưa được hỗ trợ.
      </p>
    </section>
  );
}
