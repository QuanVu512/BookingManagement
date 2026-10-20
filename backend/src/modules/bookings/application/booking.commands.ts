/** Application input for availability quoting; presentation owns validation. */
export interface QuoteAvailabilityQuery {
  courtId: string;
  startsAt: string;
  endsAt: string;
}

export interface CreateHoldCommand extends QuoteAvailabilityQuery {
  userId: string;
  idempotencyKey: string;
}

export interface CancelHoldCommand {
  userId: string;
  bookingId: string;
}
