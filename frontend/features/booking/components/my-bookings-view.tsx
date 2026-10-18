'use client';
import {
  bookingTime,
  BOOKING_STATUS_LABELS,
  formatVnd,
} from '../model/booking-time';
import type { BookingRecord } from '../model/booking';

export interface MyBookingsViewProps {
  sessionLoading: boolean;
  authenticated: boolean;
  bookings: BookingRecord[];
  loading: boolean;
  error: string;
  pendingId: string;
  nextCursor: string | null;
  signInLabel: string;
  onReload: (cursor?: string) => void;
  onCancel: (id: string) => void;
  onSignIn: () => void;
}

function BookingCard({
  booking,
  pendingId,
  onCancel,
}: {
  booking: BookingRecord;
  pendingId: string;
  onCancel: (id: string) => void;
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
        <>
          <p>
            Hạn giữ chỗ: {bookingTime(booking.holdExpiresAt, booking.timezone)}
          </p>
          <button
            className="btn btn-secondary"
            disabled={!!pendingId}
            onClick={() => onCancel(booking.id)}
          >
            {pendingId === booking.id ? 'Đang hủy…' : 'Hủy giữ chỗ'}
          </button>
        </>
      )}
    </article>
  );
}
function FeedStatus({
  loading,
  error,
  bookingsCount,
  onReload,
}: {
  loading: boolean;
  error: string;
  bookingsCount: number;
  onReload: () => void;
}) {
  return (
    <>
      <button
        className="btn btn-secondary"
        disabled={loading}
        onClick={onReload}
      >
        Tải lại
      </button>
      {loading && <p role="status">Đang tải booking…</p>}
      {error && <p role="alert">{error} Dữ liệu đang hiển thị có thể đã cũ.</p>}
      {!loading && !error && bookingsCount === 0 && <p>Chưa có booking nào.</p>}
    </>
  );
}

export function MyBookingsView({
  sessionLoading,
  authenticated,
  bookings,
  loading,
  error,
  pendingId,
  nextCursor,
  signInLabel,
  onReload,
  onCancel,
  onSignIn,
}: MyBookingsViewProps) {
  if (sessionLoading)
    return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (!authenticated)
    return (
      <button className="btn btn-primary" onClick={onSignIn}>
        {signInLabel}
      </button>
    );
  return (
    <>
      <FeedStatus
        loading={loading}
        error={error}
        bookingsCount={bookings.length}
        onReload={() => onReload()}
      />
      <div className="booking-list">
        {bookings.map((booking) => (
          <BookingCard
            key={booking.id}
            booking={booking}
            pendingId={pendingId}
            onCancel={onCancel}
          />
        ))}
      </div>
      {nextCursor && (
        <button
          className="btn btn-secondary"
          disabled={loading}
          onClick={() => onReload(nextCursor)}
        >
          Xem thêm
        </button>
      )}
    </>
  );
}
