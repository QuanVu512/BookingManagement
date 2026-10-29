'use client';

import type { UserProfile } from '../../types/auth';
import styles from './account-shell.module.css';

export function AccountProfileView({ user }: { user: UserProfile }) {
  const initial = (user.fullName || user.username || 'U').charAt(0).toUpperCase();

  return (
    <section className={styles.panel} aria-labelledby="profile-heading">
      <div className={styles.profileHeader}>
        <div className={styles.avatar} aria-hidden="true">
          {initial}
        </div>
        <div className={styles.profileMeta}>
          <h2 id="profile-heading">{user.fullName || user.username}</h2>
          <p>@{user.username}</p>
        </div>
      </div>
      <dl className={styles.grid}>
        <dt>Tên đăng nhập</dt>
        <dd>{user.username}</dd>
        <dt>Họ tên</dt>
        <dd>{user.fullName}</dd>
        <dt>Email</dt>
        <dd>{user.email ?? 'Chưa cập nhật'}</dd>
        <dt>Số điện thoại</dt>
        <dd>{user.phone}</dd>
      </dl>
    </section>
  );
}
