/**
 * Application & System Enums
 * Định nghĩa các enum hệ thống cho API response, error handling và phân trang.
 */

export const ApiStatus = {
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  FAIL: 'FAIL',
} as const;

export type ApiStatus = (typeof ApiStatus)[keyof typeof ApiStatus];

export const SortOrder = {
  ASC: 'ASC',
  DESC: 'DESC',
} as const;

export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];

export const AppErrorCode = {
  // General & Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  BAD_REQUEST: 'BAD_REQUEST',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',

  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',

  // Booking & Court Domain
  COURT_UNAVAILABLE: 'COURT_UNAVAILABLE',
  SLOT_ALREADY_BOOKED: 'SLOT_ALREADY_BOOKED',
  BOOKING_EXPIRED: 'BOOKING_EXPIRED',
  CANCELLATION_DEADLINE_PASSED: 'CANCELLATION_DEADLINE_PASSED',
  CHECKIN_INVALID: 'CHECKIN_INVALID',

  // Payment Domain
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_EXPIRED: 'PAYMENT_EXPIRED',
  REFUND_NOT_ALLOWED: 'REFUND_NOT_ALLOWED',
  IDEMPOTENCY_KEY_CONFLICT: 'IDEMPOTENCY_KEY_CONFLICT',
} as const;

export type AppErrorCode = (typeof AppErrorCode)[keyof typeof AppErrorCode];

export const CourtSlotAvailability = {
  AVAILABLE: 'AVAILABLE',
  HOLDING: 'HOLDING',
  BOOKED: 'BOOKED',
  MAINTENANCE: 'MAINTENANCE',
} as const;

export type CourtSlotAvailability =
  (typeof CourtSlotAvailability)[keyof typeof CourtSlotAvailability];
