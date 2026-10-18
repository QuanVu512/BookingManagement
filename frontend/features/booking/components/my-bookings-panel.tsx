'use client';
import { useAuthActions, useAuthSession } from '../../../context/auth-context';
import { useMyBookings } from '../hooks/use-my-bookings';
import { MyBookingsView } from './my-bookings-view';

export function MyBookingsPanel() {
  const session = useAuthSession();
  const actions = useAuthActions();
  const accountId = session.isAuthenticated ? session.user?.id : undefined;
  const feed = useMyBookings(accountId);
  const signIn = () =>
    session.status === 'unknown'
      ? void actions.refreshSession()
      : actions.openAuthModal();
  return (
    <MyBookingsView
      sessionLoading={session.isLoading}
      authenticated={session.isAuthenticated}
      bookings={feed.bookings}
      loading={feed.loading}
      error={feed.error}
      pendingId={feed.pendingId}
      nextCursor={feed.nextCursor}
      signInLabel={
        session.status === 'unknown'
          ? 'Kiểm tra lại phiên đăng nhập'
          : 'Đăng nhập'
      }
      onReload={(cursor) => void feed.reload(cursor)}
      onCancel={(id) => void feed.cancel(id)}
      onSignIn={signIn}
    />
  );
}
