/**
 * Pure pricing types owned by the Courts domain. No Prisma or transport types
 * are allowed here; persistence adapters convert their payloads into these
 * shapes before calling the pricing policy.
 */

export interface DomainBusinessHour {
  dayOfWeek: number;
  openMinute: number | null;
  closeMinute: number | null;
  isClosed: boolean;
}

export interface DomainPricingRule {
  id: string;
  startTimeMinute: number;
  endTimeMinute: number;
  /** VND per hour. The database column is NUMERIC(14,0), so this is integer. */
  pricePerHour: bigint;
  priority: number;
  isActive: boolean;
  dayOfWeek: number | null;
  /** Inclusive local calendar date in YYYY-MM-DD form. */
  effectiveFromDate: string;
  effectiveToDate: string | null;
}

export interface CourtPricingSchedule {
  timezone: string;
  businessHours: DomainBusinessHour[];
  priceRules: DomainPricingRule[];
}

export interface DomainQuoteItem {
  priceRuleId: string;
  startsAt: Date;
  endsAt: Date;
  durationMinutes: number;
  pricePerHour: bigint;
  amount: number;
}

export interface DomainCourtQuote {
  items: DomainQuoteItem[];
  totalAmount: number;
}

export type CourtPricingErrorCode =
  | 'OUTSIDE_BUSINESS_HOURS'
  | 'INVALID_WINDOW'
  | 'LOCAL_WINDOW_SPANS_DAYS'
  | 'MISSING_PRICE'
  | 'INVALID_TOTAL_AMOUNT';

/**
 * Domain-level pricing failure. Transport adapters translate this into the
 * existing Booking HTTP 400 contract while keeping the public messages stable.
 */
export class CourtPricingError extends Error {
  constructor(
    readonly code: CourtPricingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CourtPricingError';
  }
}
