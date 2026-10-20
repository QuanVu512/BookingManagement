'use client';

import type { ReactNode } from 'react';
import type { SessionStatus } from '../../types/auth';
import styles from './account-shell.module.css';

export interface AccountShellProps {
  title: string;
  status: SessionStatus;
  sessionLoading: boolean;
  sessionError: string;
  onSignIn: () => void;
  onRetrySession: () => void;
  children: ReactNode;
}

export function AccountShell({
  title,
  status,
  sessionLoading,
  sessionError,
  onSignIn,
  onRetrySession,
  children,
}: AccountShellProps) {
  return (
    <main className={`container ${styles.page}`}>
      <a className={styles.back} href="/">
        ← Về trang chủ
      </a>
      <h1>{title}</h1>
      {sessionLoading ? (
        <p role="status">Đang kiểm tra phiên đăng nhập…</p>
      ) : status === 'unknown' ? (
        <>
          <p role="status">
            {sessionError || 'Chưa kiểm tra được phiên đăng nhập.'}
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRetrySession}
          >
            Kiểm tra lại phiên
          </button>
        </>
      ) : status === 'unauthenticated' ? (
        <div>
          <p>Bạn cần đăng nhập để xem thông tin tài khoản.</p>
          <button type="button" className="btn btn-primary" onClick={onSignIn}>
            Đăng nhập
          </button>
        </div>
      ) : (
        children
      )}
    </main>
  );
}
