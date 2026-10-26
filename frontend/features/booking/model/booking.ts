export interface PriceItem {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  pricePerHour: number;
  amount: number;
}
export interface BookingRecord {
  serviceItems?: BookingServiceLine[];
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
  prepaymentPercent?: number;
  requiredPrepaymentAmount?: number;
}
export interface Availability {
  serviceItems?: BookingServiceLine[];
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
  services?: ServiceSelection[];
  prepaymentPercent?: 30 | 100;
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
  services?: ServiceSelection[];
  window: BookingWindow;
  busy: boolean;
  error: string;
  quote?: Availability;
  booking?: BookingRecord;
  canRetry: boolean;
}
export interface ServiceProduct {
  imageUrl?: string | null;
  availableQuantity?: number;
  id: string;
  code: string;
  name: string;
  kind: 'DRINK' | 'BALL' | 'PADDLE';
  billingMode: 'SALE' | 'HOURLY_RENTAL';
  unit: string;
  unitPrice: number;
}
export interface ServiceSelection {
  productId: string;
  quantity: number;
}
export interface BookingServiceLine extends ServiceSelection {
  code: string;
  name: string;
  kind: ServiceProduct['kind'];
  billingMode: ServiceProduct['billingMode'];
  unit: string;
  unitPrice: number;
  durationMinutes: number;
  amount: number;
}
export const MAX_SERVICE_QUANTITY = 99;
