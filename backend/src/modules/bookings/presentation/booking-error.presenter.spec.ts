import { afterEach, describe, expect, it, jest } from '@jest/globals';
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
import {
  rethrowBookingHttpError,
  rethrowCreateHoldHttpError,
} from './booking-error.presenter.js';

function caughtHttpError(
  present: (error: unknown) => never,
  error: unknown,
): HttpException {
  try {
    present(error);
  } catch (thrown: unknown) {
    if (thrown instanceof HttpException) return thrown;
    throw thrown;
  }
  throw new Error('Expected the presenter to throw an HttpException.');
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('booking error presenters', () => {
  it.each([
    [new BookingValidationError('invalid'), BadRequestException, 400],
    [new BookingNotFoundError('missing'), NotFoundException, 404],
    [new BookingConflictError('conflict'), ConflictException, 409],
    [new BookingUnavailableError('down'), ServiceUnavailableException, 503],
  ])(
    'maps %s to its HTTP status and keeps the message',
    (error, type, status) => {
      const httpError = caughtHttpError(rethrowBookingHttpError, error);
      expect(httpError).toBeInstanceOf(type);
      expect(httpError.getStatus()).toBe(status);
      expect(httpError.getResponse()).toMatchObject({
        statusCode: status,
        message: error.message,
      });
    },
  );

  it('rethrows unknown errors unchanged on cancel/read paths', () => {
    const unknown = new Error('database socket closed');
    expect(() => rethrowBookingHttpError(unknown)).toThrow(unknown);
  });

  it('passes foreign HTTP errors (inactive court 404) through on create', () => {
    const foreign = new NotFoundException('Không tìm thấy sân đang hoạt động.');
    const httpError = caughtHttpError(rethrowCreateHoldHttpError, foreign);
    expect(httpError).toBe(foreign);
    expect(httpError.getStatus()).toBe(404);
  });

  it('maps an unexpected persistence failure on create to a retryable 503', () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const httpError = caughtHttpError(
      rethrowCreateHoldHttpError,
      new Error('connection lost'),
    );
    expect(httpError).toBeInstanceOf(ServiceUnavailableException);
    expect(httpError.getStatus()).toBe(503);
    expect(httpError.message).toContain('thử lại cùng khóa idempotency');
  });
});
