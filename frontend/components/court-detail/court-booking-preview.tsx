/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import { FALLBACK_COURTS } from '../../data/courts';
import {
  calculateBookingOrder,
  createBookingSelection,
  getLocalDate,
} from '../../lib/court-booking';
import { CourtBookingLayout } from './court-booking-layout';

export function CourtBookingPreview() {
  const court = FALLBACK_COURTS[0];
  const selection = createBookingSelection(getLocalDate());
  const order = calculateBookingOrder(court, selection);
  const handlePreview = () => {};
  return (
    <CourtBookingLayout
      court={court}
      selection={selection}
      order={order}
      onDateChange={handlePreview}
      onSlotToggle={handlePreview}
      onQuantityChange={handlePreview}
      onVoucherInput={handlePreview}
      onVoucherApply={handlePreview}
      onCheckout={handlePreview}
    />
  );
}
