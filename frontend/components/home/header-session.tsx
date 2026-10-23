'use client';

import { useAuthActions, useAuthSession } from '../../context/auth-context';
import { AccountMenu } from '../account/account-menu';

export function HeaderSession({
  session,
}: {
  session: ReturnType<typeof useAuthSession>;
}) {
  const { logout, openSignIn, refreshSession } = useAuthActions();
  return (
    <div className="header-session">
      {session.status === 'unknown' ? (
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          disabled={session.isLoading}
          onClick={() => void refreshSession()}
        >
          {session.isLoading ? 'Đang kiểm tra phiên…' : 'Thử lại phiên'}
        </button>
      ) : session.isAuthenticated && session.user ? (
        <>
          {session.user.isStaffOrAdmin && (
            <a className="btn btn-sm btn-secondary" href="/dashboard">
              Dashboard
            </a>
          )}
          <AccountMenu
            user={session.user}
            onLogout={() => void logout().catch(() => undefined)}
          />
        </>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-primary"
          onClick={() => openSignIn()}
        >
          Đăng nhập
        </button>
      )}
      {session.status === 'unknown' && session.sessionError && (
        <p role="status">{session.sessionError}</p>
      )}
      {session.logoutError && <p role="alert">{session.logoutError}</p>}
    </div>
  );
}
