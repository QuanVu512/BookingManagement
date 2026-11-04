import type { DomainServiceSelection } from '../../courts/domain/court-services.catalog.js';

/** Application input for availability quoting; presentation owns validation. */
export interface QuoteAvailabilityQuery {
  courtId: string;
  startsAt: string;
  endsAt: string;
  services?: readonly DomainServiceSelection[];
}

export interface CreateHoldCommand extends QuoteAvailabilityQuery {
  userId: string;
  idempotencyKey: string;
  prepaymentPercent?: number;
}

export interface CancelHoldCommand {
  userId: string;
  bookingId: string;
}
