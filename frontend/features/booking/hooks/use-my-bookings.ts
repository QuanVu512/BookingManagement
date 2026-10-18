'use client';
import { useBookingFeed } from './use-booking-feed';
import { useCancelBooking } from './use-cancel-booking';

export function useMyBookings(accountId?: string) {
  const feed = useBookingFeed(accountId);
  const cancellation = useCancelBooking(feed, accountId);
  return {
    bookings: feed.state.owner === accountId ? feed.state.records : [],
    error: feed.state.error,
    loading: feed.state.loading,
    reload: feed.reload,
    nextCursor: feed.state.cursor,
    ...cancellation,
  };
}
