'use client';
import { useAuthActions, useAuthSession } from '../../context/auth-context';
import { useMyBookings } from '../../hooks/use-my-bookings';
import {
  bookingTime,
  BOOKING_STATUS_LABELS,
  formatVnd,
} from '../../lib/booking-time';
import type { BookingRecord } from '../../types/booking';

type Feed = ReturnType<typeof useMyBookings>;
function BookingCard({
  booking,
  feed,
}: {
  booking: BookingRecord;
  feed: Feed;
}) {
  return (
    <article className="booking-panel">
      <h2>
        {booking.courtName} · {booking.bookingCode}
      </h2>
      <p>{BOOKING_STATUS_LABELS[booking.status]}</p>
      <p>
        {bookingTime(booking.startsAt, booking.timezone)} →{' '}
        {bookingTime(booking.endsAt, booking.timezone)} ({booking.timezone})
      </p>
      <p>Tổng tiền sân: {formatVnd(booking.totalAmount)}</p>
      {booking.status === 'HOLDING' && (
        <CancelAction booking={booking} feed={feed} />
      )}
    </article>
  );
}
function CancelAction({
  booking,
  feed,
}: {
  booking: BookingRecord;
  feed: Feed;
}) {
  return (
    <>
      <p>Hạn giữ chỗ: {bookingTime(booking.holdExpiresAt, booking.timezone)}</p>
      <button
        className="btn btn-secondary"
        disabled={!!feed.pendingId}
        onClick={() => void feed.cancel(booking.id)}
      >
        {feed.pendingId === booking.id ? 'Đang hủy…' : 'Hủy giữ chỗ'}
      </button>
    </>
  );
}
function FeedStatus({ feed }: { feed: Feed }) {
  return (
    <>
      <button
        className="btn btn-secondary"
        disabled={feed.loading}
        onClick={() => void feed.reload()}
      >
        Tải lại
      </button>
      {feed.loading && <p role="status">Đang tải booking…</p>}
      {feed.error && (
        <p role="alert">{feed.error} Dữ liệu đang hiển thị có thể đã cũ.</p>
      )}
      {!feed.loading && !feed.error && feed.bookings.length === 0 && (
        <p>Chưa có booking nào.</p>
      )}
    </>
  );
}
function BookingsFeed({ accountId }: { accountId: string }) {
  const feed = useMyBookings(accountId);
  return (
    <>
      <FeedStatus feed={feed} />
      <div className="booking-list">
        {feed.bookings.map((booking) => (
          <BookingCard key={booking.id} booking={booking} feed={feed} />
        ))}
      </div>
      {feed.nextCursor && (
        <button
          className="btn btn-secondary"
          disabled={feed.loading}
          onClick={() => void feed.reload(feed.nextCursor ?? undefined)}
        >
          Xem thêm
        </button>
      )}
    </>
  );
}
export function MyBookingsView() {
  const session = useAuthSession();
  const actions = useAuthActions();
  if (session.isLoading)
    return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (session.isAuthenticated && session.user)
    return <BookingsFeed key={session.user.id} accountId={session.user.id} />;
  return (
    <button
      className="btn btn-primary"
      onClick={() =>
        session.status === 'unknown'
          ? void actions.refreshSession()
          : actions.openAuthModal()
      }
    >
      {session.status === 'unknown'
        ? 'Kiểm tra lại phiên đăng nhập'
        : 'Đăng nhập'}
    </button>
  );
}
