/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import type { CourtItem } from '../../types/auth';
import type { CourtTimeSlot } from '../../types/court-booking';
import {
  BOOKING_CONFIG,
  BOOKING_PERIODS,
  formatMoney,
  getSlotPrice,
  getSlotCaption,
} from '../../lib/court-booking';
import { BookingIcon } from './booking-icon';

interface SlotPickerProps {
  court: CourtItem;
  date: string;
  selectedIds: string[];
  onDateChange: (date: string) => void;
  onSlotToggle: (slotId: string) => void;
}

function TimeSlot({
  court,
  slot,
  isSelected,
  onToggle,
}: {
  court: CourtItem;
  slot: CourtTimeSlot;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className={`cb-slot ${isSelected ? 'cb-slot-selected' : ''}`}
      data-slot-id={slot.id}
      disabled={slot.isBooked || court.status !== 'ACTIVE'}
      aria-pressed={isSelected}
      onClick={onToggle}
    >
      <strong>
        {slot.start} – {slot.end}
      </strong>
      <span>
        {slot.isBooked ? 'Đã có khách' : formatMoney(getSlotPrice(court, slot))}
      </span>
      {isSelected && <BookingIcon name="check" />}
      <small>{getSlotCaption(slot, isSelected)}</small>
    </button>
  );
}

function SlotLegend() {
  return (
    <div className="cb-legend">
      <span>
        <i />
        Còn trống
      </span>
      <span>
        <i className="cb-legend-selected" />
        Đang chọn
      </span>
      <span>
        <i className="cb-legend-booked" />
        Đã được đặt
      </span>
      <span className="cb-prime-label">Giờ vàng (Prime Time)</span>
    </div>
  );
}

function SlotPickerHeading(props: SlotPickerProps) {
  return (
    <div className="cb-section-heading">
      <div>
        <h2 id="slot-heading">
          <BookingIcon name="clock" />
          Chọn lịch & khung giờ thi đấu
        </h2>
        <p>Mỗi slot 1 tiếng. Bạn có thể chọn nhiều khung giờ phù hợp.</p>
      </div>
      <label className="cb-date-label">
        Ngày thi đấu
        <input
          aria-label="Ngày thi đấu"
          type="date"
          data-booking-date
          value={props.date}
          onChange={(event) => props.onDateChange(event.target.value)}
          required
        />
      </label>
    </div>
  );
}

function SlotPeriod({
  period,
  ...props
}: SlotPickerProps & { period: { id: string; label: string } }) {
  return (
    <div className="cb-slot-period" key={period.id}>
      <h3 className={period.id === 'evening' ? 'cb-prime-label' : ''}>
        {period.label}
        {period.id === 'evening' && <span className="cb-hot">HOT</span>}
      </h3>
      <div className="cb-slots-grid">
        {BOOKING_CONFIG.slots
          .filter((slot) => slot.period === period.id)
          .map((slot) => (
            <TimeSlot
              key={slot.id}
              court={props.court}
              slot={slot}
              isSelected={props.selectedIds.includes(slot.id)}
              onToggle={() => props.onSlotToggle(slot.id)}
            />
          ))}
      </div>
    </div>
  );
}

export function CourtTimeSlotPicker(props: SlotPickerProps) {
  return (
    <section
      className="cb-panel"
      id="booking-slots"
      aria-labelledby="slot-heading"
    >
      <SlotPickerHeading {...props} />
      <SlotLegend />
      {BOOKING_PERIODS.map((period) => (
        <SlotPeriod key={period.id} period={period} {...props} />
      ))}
      <p className="cb-demo-note">
        Lịch trống đang hiển thị dữ liệu demo; giá sân theo danh mục hiện tại.
      </p>
    </section>
  );
}
