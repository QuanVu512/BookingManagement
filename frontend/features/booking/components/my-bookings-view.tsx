'use client';
import { BookingTicketList } from './booking-ticket-list';
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
    return <FeedSignIn label={signInLabel} onClick={onSignIn} />;
  return (
    <>
      <FeedStatus
        loading={loading}
        error={error}
        bookingsCount={bookings.length}
        onReload={() => onReload()}
      />
      <BookingTicketList
        bookings={bookings}
        pendingId={pendingId}
        onCancel={onCancel}
        nextCursor={nextCursor}
      />
      <FeedPagination
        nextCursor={nextCursor}
        loading={loading}
        onReload={onReload}
      />
    </>
  );
}

function FeedSignIn({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="btn btn-primary" onClick={onClick}>
      {label}
    </button>
  );
}

function FeedPagination({
  nextCursor,
  loading,
  onReload,
}: Pick<MyBookingsViewProps, 'nextCursor' | 'loading' | 'onReload'>) {
  return nextCursor ? (
    <button
      className="btn btn-secondary"
      disabled={loading}
      onClick={() => onReload(nextCursor)}
    >
      Xem thêm
    </button>
  ) : null;
}
