/**
 * Business errors owned by the Booking domain. They carry no transport
 * details; the presentation layer decides which HTTP status each code maps to.
 */
export abstract class BookingError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BookingValidationError extends BookingError {
  readonly code = 'BOOKING_VALIDATION';
}

export class BookingNotFoundError extends BookingError {
  readonly code = 'BOOKING_NOT_FOUND';
}

export class BookingConflictError extends BookingError {
  readonly code = 'BOOKING_CONFLICT';
}

export class BookingUnavailableError extends BookingError {
  readonly code = 'BOOKING_UNAVAILABLE';
}

export function isExclusionConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const details = `${error.message} ${'meta' in error ? JSON.stringify(error.meta) : ''}`;
  return /23P01|court_occupancies_no_active_overlap/.test(details);
}
