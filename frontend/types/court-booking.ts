/** @deprecated Legacy static court-detail mockup. Not part of the live route; use frontend/features/courts instead. */
import type { CourtItem } from './auth';

export interface CourtGalleryImage {
  src: string;
  alt: string;
  caption: string;
}

export interface CourtAddon {
  id: string;
  name: string;
  description: string;
  image: string;
  price: number;
  unit: string;
  badge: string;
}

export interface CourtTimeSlot {
  id: string;
  start: string;
  end: string;
  period: string;
  isPrime: boolean;
  isBooked: boolean;
}

export interface BookingSelection {
  date: string;
  slotIds: string[];
  quantities: Record<string, number>;
  voucherInput: string;
  appliedVoucher: string;
  voucherMessage: string;
  checkoutMessage: string;
}

export interface BookingOrderLine {
  product: CourtAddon;
  quantity: number;
  total: number;
}

export type BookingAction =
  | { type: 'date'; date: string }
  | { type: 'slot'; slotId: string }
  | { type: 'quantity'; productId: string; delta: number }
  | { type: 'voucher-input'; value: string }
  | { type: 'voucher-apply' }
  | { type: 'checkout'; court: CourtItem };

export interface BookingOrder {
  slots: CourtTimeSlot[];
  lines: BookingOrderLine[];
  courtTotal: number;
  addonTotal: number;
  discount: number;
  total: number;
  itemCount: number;
}

export interface CourtBookingProps {
  court: CourtItem;
  selection: BookingSelection;
  order: BookingOrder;
  onDateChange: (date: string) => void;
  onSlotToggle: (slotId: string) => void;
  onQuantityChange: (productId: string, delta: number) => void;
  onVoucherInput: (value: string) => void;
  onVoucherApply: () => void;
  onCheckout: () => void;
}
