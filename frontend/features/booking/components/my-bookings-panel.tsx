'use client';
import { useAuthActions, useAuthSession } from '../../../context/auth-context';
import { useMyBookings } from '../hooks/use-my-bookings';
import { MyBookingsView } from './my-bookings-view';
import { PaymentHistoryPanel } from './payment-history-panel';

export function MyBookingsPanel({
  initialTab = 'bookings',
}: {
  initialTab?: 'bookings' | 'payments';
}) {
  const session = useAuthSession();
  const actions = useAuthActions();
  const accountId = session.isAuthenticated ? session.user?.id : undefined;
  const feed = useMyBookings(accountId);
  const signIn = () =>
    session.status === 'unknown'
      ? void actions.refreshSession()
      : actions.openSignIn();
  if (initialTab === 'payments' && session.isAuthenticated) {
    return (
      <PaymentHistoryPanel accountId={accountId} bookings={feed.bookings} />
    );
  }
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
