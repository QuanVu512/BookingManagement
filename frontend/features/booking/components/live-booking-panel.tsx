'use client';
import type { ReactNode } from 'react';
import { useAuthActions, useAuthSession } from '../../../context/auth-context';
import { useLiveBooking, useServiceCatalog } from '../hooks/use-live-booking';
import { CourtServices } from '../../courts/components/court-services';
import { LiveBookingView } from './live-booking-view';
import { BookingSchedulePicker } from './booking-schedule-picker';
import { BookingOrderSummary } from './booking-order-summary';
import { BookingDayStrip } from './booking-day-strip';

function useBookingController(
  courtId: string,
  timezone: string,
  prepaymentPercent: 30 | 100 = 30,
) {
  const session = useAuthSession();
  const { openSignIn, refreshSession } = useAuthActions();
  const state = useLiveBooking(
    courtId,
    timezone,
    session.isAuthenticated ? session.user?.id : undefined,
    prepaymentPercent,
  );
  const signInLabel =
    session.status === 'unknown'
      ? 'Kiểm tra lại phiên đăng nhập'
      : 'Đăng nhập để giữ sân';
  const signIn = () =>
    session.status === 'unknown' ? void refreshSession() : openSignIn();
  return {
    state,
    timezone,
    authenticated: session.isAuthenticated,
    showSignIn: !session.isLoading && !session.isAuthenticated,
    signInLabel,
    onChangeWindow: state.changeWindow,
    onQuote: state.quoteAvailability,
    onCreate: state.createHold,
    onSignIn: signIn,
    onChangeService: state.changeService,
  };
}

export function LiveBookingPanel({
  courtId,
  timezone,
  prepaymentPercent = 30,
  detail,
}: {
  courtId: string;
  timezone: string;
  prepaymentPercent?: 30 | 100;
  detail?: {
    name: string;
    code: string;
    overview: ReactNode;
  };
}) {
  const props = useBookingController(courtId, timezone, prepaymentPercent);
  const catalog = useServiceCatalog(courtId, props.state.window, timezone);
  if (!detail) return <LiveBookingView {...props} />;
  return (
    <div className="court-detail-grid">
      <BookingDayStrip {...props} />
      <div className="court-detail-main">
        {detail.overview}
        <BookingSchedulePicker {...props} />
        <CourtServices
          products={catalog.products}
          loading={catalog.loading}
          error={catalog.error}
          onRetry={catalog.retry}
          selection={props.state.services ?? []}
          disabled={props.state.busy || Boolean(props.state.booking)}
          onChange={props.onChangeService}
        />
      </div>
      <BookingOrderSummary
        {...props}
        courtName={detail.name}
        courtCode={detail.code}
        products={catalog.products}
      />
    </div>
  );
}
