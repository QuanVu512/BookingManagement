'use client';
import Link from 'next/link';
import { useAuthActions, useAuthSession } from '../../context/auth-context';
import { useLiveBooking } from '../../hooks/use-live-booking';
import {
  bookingTime,
  BOOKING_STATUS_LABELS,
  formatVnd,
} from '../../lib/booking-time';
import type { Availability, BookingRecord } from '../../types/booking';

type LiveState = ReturnType<typeof useLiveBooking>;

function Quote({ quote }: { quote: Availability }) {
  return (
    <section aria-label="Báo giá từ máy chủ">
      <h2>
        {quote.available ? 'Khoảng sân đang trống' : 'Khoảng sân chưa khả dụng'}
      </h2>
      {quote.reason && <p role="status">{quote.reason}</p>}
      <ul>
        {quote.priceItems.map((item) => (
          <li key={item.startsAt}>
            {bookingTime(item.startsAt, quote.timezone)} →{' '}
            {bookingTime(item.endsAt, quote.timezone)}: {formatVnd(item.amount)}
          </li>
        ))}
      </ul>
      <p>
        <strong>Tổng tiền sân: {formatVnd(quote.totalAmount)}</strong>
      </p>
      <p>
        Vệ sinh thêm {quote.cleanupMinutes} phút, không tính phí. Khóa lịch đến{' '}
        {bookingTime(quote.occupiedUntil, quote.timezone)}.
      </p>
      <p>Lịch có thể thay đổi trước khi tạo giữ chỗ.</p>
    </section>
  );
}
function TimeInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="datetime-local"
        required
        step="60"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function TimeFields({ state }: { state: LiveState }) {
  return (
    <>
      <TimeInput
        label="Bắt đầu"
        value={state.window.start}
        onChange={(start) => state.changeWindow({ ...state.window, start })}
      />
      <TimeInput
        label="Kết thúc"
        value={state.window.end}
        onChange={(end) => state.changeWindow({ ...state.window, end })}
      />
    </>
  );
}
function BookingConsent() {
  return (
    <label className="booking-consent">
      <input type="checkbox" required /> Tôi đồng ý giữ chỗ 5 phút; chưa có
      thanh toán hoặc xác nhận sân. Có thể hủy trước giờ chơi khi chưa check-in.
    </label>
  );
}
function BookingFields({
  state,
  authenticated,
}: {
  state: LiveState;
  authenticated: boolean;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void state.run('create');
      }}
    >
      <fieldset disabled={state.busy}>
        <TimeFields state={state} />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void state.run('quote')}
        >
          Kiểm tra lịch & giá
        </button>
        <BookingConsent />
        <HoldSubmitButton state={state} authenticated={authenticated} />
      </fieldset>
    </form>
  );
}
function HoldSubmitButton({
  state,
  authenticated,
}: {
  state: LiveState;
  authenticated: boolean;
}) {
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={!authenticated || !state.quote?.available || !!state.booking}
    >
      Giữ chỗ 5 phút
    </button>
  );
}
function BookingResult({ booking }: { booking: BookingRecord }) {
  return (
    <p role="status">
      {booking.bookingCode}: {BOOKING_STATUS_LABELS[booking.status]}. Hạn giữ
      chỗ: {bookingTime(booking.holdExpiresAt, booking.timezone)}.{' '}
      <Link href="/bookings">Xem trạng thái / hủy</Link>
    </p>
  );
}
function BookingFeedback({
  state,
  authenticated,
}: {
  state: LiveState;
  authenticated: boolean;
}) {
  return (
    <>
      {state.busy && <p role="status">Đang xử lý…</p>}
      {state.error && (
        <p role="alert">
          {state.error} Nếu chưa rõ kết quả, kiểm tra lại yêu cầu hoặc xem
          Booking của tôi.
        </p>
      )}
      {state.canRetry && (
        <button
          className="btn btn-secondary"
          disabled={state.busy || !authenticated}
          onClick={() => void state.run('create')}
        >
          Kiểm tra lại yêu cầu giữ chỗ
        </button>
      )}
      {state.quote && <Quote quote={state.quote} />}
      {state.booking && <BookingResult booking={state.booking} />}
    </>
  );
}
function BookingSignIn() {
  const session = useAuthSession();
  const { openAuthModal, refreshSession } = useAuthActions();
  if (session.isLoading || session.isAuthenticated) return null;
  return (
    <button
      className="btn btn-secondary"
      onClick={() =>
        session.status === 'unknown' ? void refreshSession() : openAuthModal()
      }
    >
      {session.status === 'unknown'
        ? 'Kiểm tra lại phiên đăng nhập'
        : 'Đăng nhập để giữ sân'}
    </button>
  );
}
export function LiveBookingForm({
  courtId,
  timezone,
}: {
  courtId: string;
  timezone: string;
}) {
  const session = useAuthSession();
  const state = useLiveBooking(
    courtId,
    timezone,
    session.isAuthenticated ? session.user?.id : undefined,
  );
  return (
    <section className="booking-panel" aria-label="Đặt sân">
      <h2>Chọn khoảng chơi</h2>
      <p>
        Giờ theo {timezone}. Thời lượng linh hoạt theo phút, bắt đầu sau ít nhất
        5 phút.
      </p>
      <BookingFields state={state} authenticated={session.isAuthenticated} />
      <BookingFeedback state={state} authenticated={session.isAuthenticated} />
      <BookingSignIn />
      <p>
        Giai đoạn này chỉ giữ chỗ, không thu tiền hoặc chuyển sang CONFIRMED.
      </p>
    </section>
  );
}
