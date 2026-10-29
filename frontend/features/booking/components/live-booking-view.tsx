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
import type { OccupancyGridState } from '../hooks/use-court-occupancy-grid';

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
  /** Day-grid occupancy feed (optional: absent keeps legacy static labels). */
  courtId?: string;
  occupancy?: OccupancyGridState | null;
  /** True when the chosen window overlaps another booking (not self-hold). */
  gridConflict?: boolean;
  /** True when the grid failed to load or went stale past the threshold. */
  gridLocked?: boolean;
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
  gridConflict,
  gridLocked,
}: Pick<
  LiveBookingViewProps,
  | 'state'
  | 'authenticated'
  | 'onChangeWindow'
  | 'onQuote'
  | 'onCreate'
  | 'timezone'
  | 'gridConflict'
  | 'gridLocked'
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
        <HoldSubmitButton
          state={state}
          authenticated={authenticated}
          gridConflict={gridConflict}
          gridLocked={gridLocked}
        />
      </fieldset>
    </form>
  );
}
function HoldSubmitButton({
  state,
  authenticated,
  gridConflict,
  gridLocked,
}: {
  state: LiveBookingState;
  authenticated: boolean;
  gridConflict?: boolean;
  gridLocked?: boolean;
}) {
  const gridBlocked = gridConflict === true || gridLocked === true;
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={
        !authenticated ||
        !state.quote?.available ||
        !!state.booking ||
        gridBlocked
      }
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
  gridConflict,
  gridLocked,
}: LiveBookingViewProps) {
  return (
    <section className="booking-panel" aria-label="Đặt sân">
      <h2>Chọn khoảng chơi</h2>
      <p>
        Giờ theo {timezone}. Thời lượng linh hoạt theo phút, bắt đầu sau ít nhất
        5 phút.
      </p>
      {gridConflict === true && !state.booking && (
        <p role="alert" style={{ color: '#f87171', fontSize: '13px' }}>
          ⚠️ Khoảng giờ bạn chọn đã bị trùng lịch. Vui lòng điều chỉnh lại khung
          giờ.
        </p>
      )}
      <BookingFields
        timezone={timezone}
        state={state}
        authenticated={authenticated}
        onChangeWindow={onChangeWindow}
        onQuote={onQuote}
        onCreate={onCreate}
        gridConflict={gridConflict}
        gridLocked={gridLocked}
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
