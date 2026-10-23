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
} from '../model/booking-time';

type PickerProps = Pick<
  LiveBookingViewProps,
  'state' | 'onChangeWindow' | 'timezone'
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
}: PickerProps & { hour: number }) {
  const start = state.window.start.slice(11);
  const end = state.window.end.slice(11);
  return (
    <button
      type="button"
      disabled={!state.window.start || state.busy}
      aria-label={`${presetTime(hour)} – ${presetTime(hour + 1)}`}
      aria-pressed={start <= presetTime(hour) && end >= presetTime(hour + 1)}
      onClick={() => onChangeWindow(selectPreset(state.window, hour))}
    >
      {presetTime(hour)} – {presetTime(hour + 1)}
      <small>
        {start <= presetTime(hour) && end >= presetTime(hour + 1)
          ? 'Đang chọn ✓'
          : 'Kiểm tra lịch để biết còn trống'}
      </small>
    </button>
  );
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

function ScheduleHeading({ state, timezone, onChangeWindow }: PickerProps) {
  return (
    <div className="detail-section-heading">
      <h2 id="schedule-heading">Chọn lịch & khung giờ</h2>
      <label>
        Ngày chơi
        <BookingDateInput
          timezone={timezone}
          disabled={state.busy}
          value={state.window.start.slice(0, 10)}
          onChange={(date) =>
            onChangeWindow(changeBookingDate(state.window, date))
          }
        />
      </label>
    </div>
  );
}

function CustomTimeField({
  field,
  state,
  onChangeWindow,
}: PickerProps & { field: 'start' | 'end' }) {
  return (
    <label>
      {field === 'start' ? 'Bắt đầu' : 'Kết thúc'}
      <input
        type="time"
        required
        step="60"
        value={state.window[field].slice(11)}
        onChange={(event) =>
          onChangeWindow({
            ...state.window,
            [field]: `${state.window.start.slice(0, 10)}T${event.target.value}`,
          })
        }
      />
    </label>
  );
}

function CustomTimeRange(props: PickerProps) {
  return (
    <fieldset disabled={props.state.busy} className="schedule-custom">
      <CustomTimeField field="start" {...props} />
      <CustomTimeField field="end" {...props} />
    </fieldset>
  );
}

export function BookingSchedulePicker(props: LiveBookingViewProps) {
  return (
    <section
      className="detail-panel schedule-panel"
      id="booking-slots"
      aria-labelledby="schedule-heading"
    >
      <ScheduleHeading {...props} />
      <p className="detail-muted">
        Giờ theo {props.timezone}. Chọn các giờ liền nhau hoặc nhập khoảng chơi
        bên dưới. Kiểm tra lịch để biết giá và tình trạng sân.
      </p>
      {BOOKING_PERIODS.map((period) => (
        <PresetPeriod key={period.label} period={period} {...props} />
      ))}
      <CustomTimeRange {...props} />
      <button
        type="button"
        className="btn btn-secondary"
        disabled={props.state.busy}
        onClick={props.onQuote}
      >
        Kiểm tra lịch & giá
      </button>
      {props.state.busy && <p role="status">Đang xử lý…</p>}
    </section>
  );
}
