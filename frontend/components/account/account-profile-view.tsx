'use client';

import type { UserProfile } from '../../types/auth';
import styles from './account-shell.module.css';

export function AccountProfileView({ user }: { user: UserProfile }) {
  return (
    <section className={styles.panel} aria-labelledby="profile-heading">
      <h2 id="profile-heading">Hồ sơ của bạn</h2>
      <dl className={styles.grid}>
        <dt>Tên đăng nhập</dt>
        <dd>{user.username}</dd>
        <dt>Họ tên</dt>
        <dd>{user.fullName}</dd>
        <dt>Email</dt>
        <dd>{user.email ?? 'Chưa cập nhật'}</dd>
        <dt>Số điện thoại</dt>
        <dd>{user.phone}</dd>
        <dt>Vai trò</dt>
        <dd>{user.primaryRole}</dd>
      </dl>
      <p className={styles.note}>
        Thông tin được đồng bộ từ máy chủ. Hệ thống chưa hỗ trợ chỉnh sửa hồ sơ
        trực tiếp.
      </p>
    </section>
  );
}
