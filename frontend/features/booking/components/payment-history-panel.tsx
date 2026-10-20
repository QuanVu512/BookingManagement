'use client';

import type { BookingRecord } from '../model/booking';
import { useBookingPaymentHistory } from '../hooks/use-booking-payment-history';
import { PaymentHistoryView } from './payment-history-view';

export function PaymentHistoryPanel({
  accountId,
  bookings,
}: {
  accountId?: string;
  bookings: BookingRecord[];
}) {
  const history = useBookingPaymentHistory(accountId);
  return (
    <PaymentHistoryView
      bookings={bookings}
      bookingId={history.bookingId}
      resources={history.resources}
      refreshing={history.refreshing}
      cooldownUntil={history.cooldownUntil}
      updatedAt={history.updatedAt}
      onToggle={history.toggle}
      onRefresh={history.refresh}
      onRetry={history.retry}
    />
  );
}
