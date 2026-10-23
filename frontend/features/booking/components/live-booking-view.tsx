'use client';
import Link from 'next/link';
import { BookingDateTimeInput } from './booking-schedule-picker';
import { bookingTime, BOOKING_STATUS_LABELS } from '../model/booking-time';
import type {
  Availability,
  BookingRecord,
  BookingWindow,
  LiveBookingState,
} from '../model/booking';

export interface LiveBookingViewProps {
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
  return quote.available ? null : <p role="status">{quote.reason}</p>;
}
function TimeFields({
  state,
  onChangeWindow,
  timezone,
}: Pick<LiveBookingViewProps, 'state' | 'onChangeWindow' | 'timezone'>) {
  return (
    <>
      <BookingDateTimeInput
        timezone={timezone}
        label="Bắt đầu"
        value={state.window.start}
        onChange={(start) => onChangeWindow({ ...state.window, start })}
      />
      <BookingDateTimeInput
        timezone={timezone}
        label="Kết thúc"
        value={state.window.end}
        onChange={(end) => onChangeWindow({ ...state.window, end })}
      />
    </>
  );
}
function BookingFields({
  state,
  authenticated,
  onChangeWindow,
  onQuote,
  onCreate,
  timezone,
}: Pick<
  LiveBookingViewProps,
  | 'state'
  | 'authenticated'
  | 'onChangeWindow'
  | 'onQuote'
  | 'onCreate'
  | 'timezone'
>) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onCreate();
      }}
    >
      <fieldset disabled={state.busy}>
        <TimeFields
          state={state}
          timezone={timezone}
          onChangeWindow={onChangeWindow}
        />
        <button type="button" className="btn btn-secondary" onClick={onQuote}>
          Kiểm tra lịch & giá
        </button>
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
      Đặt sân
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
export function BookingFeedback({
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
        timezone={timezone}
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
    </section>
  );
}
