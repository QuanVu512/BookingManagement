export interface PriceItem {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  pricePerHour: number;
  amount: number;
}
export interface BookingRecord {
  id: string;
  bookingCode: string;
  courtId: string;
  courtName: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  holdExpiresAt: string;
  status:
    | 'HOLDING'
    | 'EXPIRED'
    | 'CANCELLED'
    | 'CONFIRMED'
    | 'CHECKED_IN'
    | 'COMPLETED'
    | 'NO_SHOW';
  totalAmount: number;
  currency: string;
  priceItems: PriceItem[];
}
export interface Availability {
  available: boolean;
  reason: string | null;
  totalAmount: number;
  currency: string;
  cleanupMinutes: number;
  timezone: string;
  serverNow: string;
  occupiedUntil: string;
  priceItems: PriceItem[];
}
export interface BookingInput {
  policyAccepted: true;
  courtId: string;
  startsAt: string;
  endsAt: string;
  idempotencyKey: string;
}
export interface BookingWindow {
  start: string;
  end: string;
}
export interface LiveBookingState {
  window: BookingWindow;
  busy: boolean;
  error: string;
  quote?: Availability;
  booking?: BookingRecord;
  canRetry: boolean;
}
