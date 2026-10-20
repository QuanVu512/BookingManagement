import {
  BadRequestException,
  ConflictException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  BookingConflictError,
  BookingNotFoundError,
  BookingUnavailableError,
  BookingValidationError,
} from '../domain/booking-errors.js';

const logger = new Logger('BookingHttpError');

/**
 * Maps Booking business errors to the existing HTTP exception contract. Nest
 * still renders the same `{ statusCode, message, error }` body as before.
 */
function asBookingHttpError(error: unknown): HttpException | null {
  if (error instanceof BookingValidationError)
    return new BadRequestException(error.message);
  if (error instanceof BookingNotFoundError)
    return new NotFoundException(error.message);
  if (error instanceof BookingConflictError)
    return new ConflictException(error.message);
  if (error instanceof BookingUnavailableError)
    return new ServiceUnavailableException(error.message);
  return null;
}

/**
 * Cancel/read paths keep their previous behaviour: unknown errors propagate
 * unchanged (500), while known business errors become HTTP exceptions.
 */
export function rethrowBookingHttpError(error: unknown): never {
  const mapped = asBookingHttpError(error);
  if (mapped) throw mapped;
  throw error;
}

/**
 * Create keeps the old retryable 503 for unexpected persistence failures, but
 * foreign HTTP errors (for example an inactive court 404 or an out-of-hours
 * 400 raised by Courts) must pass through unchanged.
 */
export function rethrowCreateHoldHttpError(error: unknown): never {
  const mapped = asBookingHttpError(error);
  if (mapped) throw mapped;
  if (error instanceof HttpException) throw error;
  logger.error('Booking transaction unavailable.');
  throw new ServiceUnavailableException(
    'Chưa xử lý được giữ chỗ. Hãy thử lại cùng khóa idempotency.',
  );
}
