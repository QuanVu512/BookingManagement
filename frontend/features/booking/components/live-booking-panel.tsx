'use client';
import { useAuthActions, useAuthSession } from '../../../context/auth-context';
import { useLiveBooking } from '../hooks/use-live-booking';
import { LiveBookingView } from './live-booking-view';

export function LiveBookingPanel({
  courtId,
  timezone,
}: {
  courtId: string;
  timezone: string;
}) {
  const session = useAuthSession();
  const { openAuthModal, refreshSession } = useAuthActions();
  const state = useLiveBooking(
    courtId,
    timezone,
    session.isAuthenticated ? session.user?.id : undefined,
  );
  const signInLabel =
    session.status === 'unknown'
      ? 'Kiểm tra lại phiên đăng nhập'
      : 'Đăng nhập để giữ sân';
  const signIn = () =>
    session.status === 'unknown' ? void refreshSession() : openAuthModal();
  return (
    <LiveBookingView
      state={state}
      timezone={timezone}
      authenticated={session.isAuthenticated}
      showSignIn={!session.isLoading && !session.isAuthenticated}
      signInLabel={signInLabel}
      onChangeWindow={state.changeWindow}
      onQuote={state.quoteAvailability}
      onCreate={state.createHold}
      onSignIn={signIn}
    />
  );
}
