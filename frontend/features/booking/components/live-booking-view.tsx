'use client';
import Link from 'next/link';
import {
  bookingTime,
  BOOKING_STATUS_LABELS,
  formatVnd,
} from '../model/booking-time';
import type {
  Availability,
  BookingRecord,
  BookingWindow,
  LiveBookingState,
} from '../model/booking';

interface LiveBookingViewProps {
  state: LiveBookingState;
  timezone: string;
  authenticated: boolean;
  showSignIn: boolean;
  signInLabel: string;
  onChangeWindow: (window: BookingWindow) => void;
  onQuote: () => void;
  onCreate: () => void;
  onSignIn: () => void;
}

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
function TimeFields({
  state,
  onChangeWindow,
}: {
  state: LiveBookingState;
  onChangeWindow: (window: BookingWindow) => void;
}) {
  return (
    <>
      <TimeInput
        label="Bắt đầu"
        value={state.window.start}
        onChange={(start) => onChangeWindow({ ...state.window, start })}
      />
      <TimeInput
        label="Kết thúc"
        value={state.window.end}
        onChange={(end) => onChangeWindow({ ...state.window, end })}
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
  onChangeWindow,
  onQuote,
  onCreate,
}: {
  state: LiveBookingState;
  authenticated: boolean;
  onChangeWindow: (window: BookingWindow) => void;
  onQuote: () => void;
  onCreate: () => void;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onCreate();
      }}
    >
      <fieldset disabled={state.busy}>
        <TimeFields state={state} onChangeWindow={onChangeWindow} />
        <button type="button" className="btn btn-secondary" onClick={onQuote}>
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
  state: LiveBookingState;
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
  onCreate,
}: {
  state: LiveBookingState;
  authenticated: boolean;
  onCreate: () => void;
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
          onClick={onCreate}
        >
          Kiểm tra lại yêu cầu giữ chỗ
        </button>
      )}
      {state.quote && <Quote quote={state.quote} />}
      {state.booking && <BookingResult booking={state.booking} />}
    </>
  );
}
function BookingSignIn({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button className="btn btn-secondary" onClick={onClick}>
      {label}
    </button>
  );
}

export function LiveBookingView({
  state,
  timezone,
  authenticated,
  showSignIn,
  signInLabel,
  onChangeWindow,
  onQuote,
  onCreate,
  onSignIn,
}: LiveBookingViewProps) {
  return (
    <section className="booking-panel" aria-label="Đặt sân">
      <h2>Chọn khoảng chơi</h2>
      <p>
        Giờ theo {timezone}. Thời lượng linh hoạt theo phút, bắt đầu sau ít nhất
        5 phút.
      </p>
      <BookingFields
        state={state}
        authenticated={authenticated}
        onChangeWindow={onChangeWindow}
        onQuote={onQuote}
        onCreate={onCreate}
      />
      <BookingFeedback
        state={state}
        authenticated={authenticated}
        onCreate={onCreate}
      />
      {showSignIn && <BookingSignIn label={signInLabel} onClick={onSignIn} />}
      <p>
        Giai đoạn này chỉ giữ chỗ, không thu tiền hoặc chuyển sang CONFIRMED.
      </p>
    </section>
  );
}
