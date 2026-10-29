'use client';

import {
  BOOKING_PERIODS,
  presetTime,
  selectPreset,
  changeBookingDate,
} from '../model/booking-presets';
import type { LiveBookingViewProps } from './live-booking-view';
import { useBookingDateBounds } from '../hooks/use-live-booking';
import {
  DEFAULT_BOOKING_TIMEZONE,
  formatBookingDate,
  isBookableDate,
  isSlotInPast,
  getNowInTimezone,
} from '../model/booking-time';
import {
  OCCUPANCY_LABELS,
  findSlotOccupancy,
  isOutsideBusinessHours,
  isSelfHoldSlot,
  isSlotPast,
  isTooSoon,
  type OccupiedInterval,
} from '../model/booking-occupancy';

type PickerProps = Pick<
  LiveBookingViewProps,
  'state' | 'onChangeWindow' | 'timezone' | 'occupancy' | 'gridLocked'
>;

export function BookingDateInput({
  value,
  onChange,
  timezone = DEFAULT_BOOKING_TIMEZONE,
  disabled,
  label = 'Ngày chơi',
}: {
  value: string;
  onChange: (date: string) => void;
  timezone?: string;
  disabled?: boolean;
  label?: string;
}) {
  const bounds = useBookingDateBounds(timezone);
  return (
    <span className="booking-date-input" data-disabled={disabled || undefined}>
      <span aria-hidden="true">{formatBookingDate(value) || 'dd/MM/yyyy'}</span>
      <input
        type="date"
        aria-label={label}
        required
        disabled={disabled}
        min={bounds.min}
        max={bounds.max}
        value={value}
        onChange={(event) => {
          const date = event.target.value;
          if (!date || isBookableDate(date, timezone)) onChange(date);
          else event.currentTarget.value = value;
        }}
      />
    </span>
  );
}

export function BookingDateTimeInput({
  label,
  value,
  onChange,
  timezone = DEFAULT_BOOKING_TIMEZONE,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  timezone?: string;
  disabled?: boolean;
}) {
  return (
    <fieldset className="booking-datetime" disabled={disabled}>
      <legend>{label}</legend>
      <BookingDateInput
        label={`${label} — ngày`}
        timezone={timezone}
        value={value.slice(0, 10)}
        onChange={(date) =>
          onChange(date ? `${date}T${value.slice(11) || '08:00'}` : '')
        }
      />
      <input
        type="time"
        required
        step="60"
        aria-label={`${label} — giờ`}
        value={value.slice(11)}
        onChange={(event) =>
          onChange(`${value.slice(0, 10)}T${event.target.value}`)
        }
      />
    </fieldset>
  );
}

function PresetButton({
  hour,
  state,
  onChangeWindow,
  timezone,
  occupancy,
  gridLocked,
}: PickerProps & { hour: number }) {
  const selectedDate = state.window.start.slice(0, 10);
  const grid = occupancy?.data ?? null;
  const gridLoading =
    occupancy !== undefined &&
    occupancy !== null &&
    occupancy.status === 'loading';
  const gridFailed = occupancy?.status === 'error';
  const effectiveNowMs = gridEffectiveNowMs(occupancy);
  const legacyPast = isSlotInPast(selectedDate, hour, timezone);
  const slotPast = grid
    ? isSlotPast(selectedDate, hour, timezone, effectiveNowMs)
    : legacyPast;
  const conflict = grid
    ? findSlotOccupancy(
        selectedDate,
        hour,
        grid.timezone,
        grid.cleanupMinutes,
        grid.occupiedIntervals,
      )
    : null;
  // Self-hold protection: the current user's own hold window never counts as
  // someone else's occupancy, so the QR modal is never wiped by a refresh.
  const selfHold =
    grid && !gridFailed
      ? isSelfHoldSlot(selectedDate, hour, timezone, gridBookingWindow(state))
      : false;
  const occupier: OccupiedInterval | null = selfHold ? null : conflict;
  const unavailable = grid
    ? grid.businessHours.isClosed ||
      gridFailed ||
      isOutsideBusinessHours(hour, grid.businessHours) ||
      isTooSoon(selectedDate, hour, timezone, effectiveNowMs)
    : false;
  const start = state.window.start.slice(11);
  const end = state.window.end.slice(11);
  const isSelected =
    !slotPast &&
    Boolean(start && end) &&
    start <= presetTime(hour) &&
    end >= presetTime(hour + 1);
  const locked = gridFailed === true || gridLocked === true || gridLoading;

  const statusLabel = selfHold
    ? 'Đang giữ chỗ (Của bạn)'
    : occupier
      ? OCCUPANCY_LABELS[occupier.kind]
      : unavailable
        ? 'Không khả dụng'
        : slotPast
          ? 'Đã qua giờ'
          : grid
            ? isSelected
              ? 'Đang chọn ✓'
              : 'Còn trống'
            : isSelected
              ? 'Đang chọn ✓'
              : 'Kiểm tra lịch để biết còn trống';
  const occupiedKind = occupier ? occupier.kind : null;

  return (
    <button
      type="button"
      disabled={
        slotPast ||
        unavailable ||
        occupier !== null ||
        locked ||
        !state.window.start ||
        state.busy ||
        Boolean(state.booking)
      }
      aria-label={`${presetTime(hour)} – ${presetTime(hour + 1)} (${statusLabel})`}
      aria-pressed={isSelected}
      data-past={slotPast ? 'true' : undefined}
      data-occupied={occupiedKind ?? undefined}
      className={slotPast ? 'slot-past' : undefined}
      onClick={() => {
        if (!slotPast && !occupier && !unavailable) {
          onChangeWindow(selectPreset(state.window, hour));
        }
      }}
    >
      {presetTime(hour)} – {presetTime(hour + 1)}
      <small className={slotPast ? 'slot-status-past' : undefined}>
        {statusLabel}
      </small>
    </button>
  );
}

function gridEffectiveNowMs(occupancy: PickerProps['occupancy']): number {
  const grid = occupancy?.data;
  if (!grid) return Date.now();
  const serverMs = Date.parse(grid.serverNow);
  if (!Number.isFinite(serverMs)) return Date.now();
  // Monotonic correction: advance the snapshot by time since it arrived so
  // PAST/TOO_SOON checks do not freeze between 15s polls.
  const lastUpdated = occupancy?.lastUpdatedMs ?? Date.now();
  return serverMs + Math.max(0, Date.now() - lastUpdated);
}

function gridBookingWindow(
  state: PickerProps['state'],
): { startsAt: string; endsAt: string } | undefined {
  const booking = state.booking;
  if (!booking) return undefined;
  return { startsAt: booking.startsAt, endsAt: booking.endsAt };
}

function PresetPeriod({
  period,
  ...props
}: PickerProps & { period: (typeof BOOKING_PERIODS)[number] }) {
  return (
    <div className="schedule-period">
      <h3>{period.label}</h3>
      <div className="schedule-presets">
        {period.hours.map((hour) => (
          <PresetButton key={hour} hour={hour} {...props} />
        ))}
      </div>
    </div>
  );
}

function ScheduleHeading({
  state,
  timezone,
  onChangeWindow,
  occupancy,
}: PickerProps) {
  return (
    <div className="detail-section-heading">
      <h2 id="schedule-heading">Chọn lịch & khung giờ</h2>
      <label>
        Ngày chơi
        <BookingDateInput
          timezone={timezone}
          disabled={state.busy || Boolean(state.booking)}
          value={state.window.start.slice(0, 10)}
          onChange={(date) =>
            onChangeWindow(changeBookingDate(state.window, date, timezone))
          }
        />
      </label>
      {occupancy !== undefined && occupancy !== null && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={occupancy.status === 'loading'}
          onClick={occupancy.refresh}
          aria-label="Làm mới lịch sân"
        >
          {occupancy.status === 'loading' ? 'Đang tải…' : 'Làm mới lịch'}
        </button>
      )}
    </div>
  );
}

function CustomTimeField({
  field,
  state,
  timezone,
  onChangeWindow,
}: PickerProps & { field: 'start' | 'end' }) {
  const selectedDate = state.window.start.slice(0, 10);
  const current = getNowInTimezone(timezone);
  const isToday = selectedDate === current.date;
  const startTime = state.window.start.slice(11);
  const timeValue = state.window[field]?.slice(11) ?? '';

  const minTime =
    field === 'start'
      ? isToday
        ? current.time
        : undefined
      : startTime || undefined;

  return (
    <label>
      {field === 'start' ? 'Bắt đầu' : 'Kết thúc'}
      <input
        type="time"
        required
        step="60"
        min={minTime}
        value={timeValue}
        onChange={(event) => {
          const val = event.target.value;
          onChangeWindow({
            ...state.window,
            [field]: val ? `${selectedDate}T${val}` : `${selectedDate}T`,
          });
        }}
      />
    </label>
  );
}

function CustomTimeRange(props: PickerProps) {
  const selectedDate = props.state.window.start.slice(0, 10);
  const current = getNowInTimezone(props.timezone);
  const isToday = selectedDate === current.date;
  const startTime = props.state.window.start.slice(11);
  const endTime = props.state.window.end.slice(11);
  const isPast = isToday && startTime !== '' && startTime < current.time;
  const isInvalidRange =
    startTime !== '' && endTime !== '' && startTime >= endTime;

  return (
    <div className="schedule-custom-wrapper">
      <fieldset
        disabled={props.state.busy || Boolean(props.state.booking)}
        className="schedule-custom"
      >
        <CustomTimeField field="start" {...props} />
        <CustomTimeField field="end" {...props} />
      </fieldset>
      {isPast && (
        <p
          className="schedule-time-error"
          role="alert"
          style={{ color: '#f87171', fontSize: '13px', margin: '4px 0 0' }}
        >
          ⚠️ Giờ bắt đầu đã qua thời gian hiện tại ({current.time}). Vui lòng
          chọn khung giờ từ {current.time} trở đi.
        </p>
      )}
      {isInvalidRange && (
        <p
          className="schedule-time-error"
          role="alert"
          style={{ color: '#f87171', fontSize: '13px', margin: '4px 0 0' }}
        >
          ⚠️ Giờ kết thúc phải sau giờ bắt đầu.
        </p>
      )}
    </div>
  );
}

export function BookingSchedulePicker(props: LiveBookingViewProps) {
  const occupancy = props.occupancy ?? null;
  return (
    <section
      className="detail-panel schedule-panel"
      id="booking-slots"
      aria-labelledby="schedule-heading"
    >
      <ScheduleHeading {...props} />
      {occupancy?.status === 'error' && (
        <p role="alert" style={{ color: '#f87171', fontSize: '13px' }}>
          Không tải được lịch sân. Vui lòng kiểm tra kết nối.{' '}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={occupancy.refresh}
          >
            Thử lại
          </button>
        </p>
      )}
      {occupancy?.status === 'ready' && occupancy.isStale && (
        <p role="status" style={{ fontSize: '13px', color: '#fbbf24' }}>
          Đang đồng bộ lịch mới nhất…
        </p>
      )}
      {occupancy?.status === 'ready' &&
        occupancy.failures > 0 &&
        props.gridLocked !== true && (
          <p role="status" style={{ fontSize: '13px', color: '#fbbf24' }}>
            Dữ liệu có thể chưa mới nhất. Hệ thống đang thử đồng bộ lại.
          </p>
        )}
      {/* Đưa phần chọn giờ Bắt đầu / Kết thúc lên ngay dưới Ngày chơi */}
      <CustomTimeRange {...props} />
      <p className="detail-muted" style={{ marginTop: '10px' }}>
        Giờ theo {props.timezone}. Chọn các giờ liền nhau ở các buổi bên dưới
        hoặc điều chỉnh khoảng chơi ở trên. Giá sẽ tự động cập nhật ngay khi
        chọn.
      </p>
      {props.gridConflict === true && !props.state.booking && (
        <p
          className="schedule-time-error"
          role="alert"
          style={{ color: '#f87171', fontSize: '13px' }}
        >
          ⚠️ Khoảng giờ bạn chọn đã bị trùng lịch. Vui lòng điều chỉnh lại khung
          giờ.
        </p>
      )}
      {occupancy?.status === 'loading' && (
        <p role="status" aria-busy="true" style={{ fontSize: '13px' }}>
          Đang tải lịch sân…
        </p>
      )}
      {BOOKING_PERIODS.map((period) => (
        <PresetPeriod key={period.label} period={period} {...props} />
      ))}
      {props.state.busy && <p role="status">Đang tính giá & kiểm tra lịch…</p>}
    </section>
  );
}
