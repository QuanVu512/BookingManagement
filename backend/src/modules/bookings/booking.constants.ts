export const MINUTE_MS = 60_000;
export const HOLD_DURATION_MS = 5 * MINUTE_MS;
export const BOOKING_POLICY_VERSION = 'mvp-hold-v1';
export const BOOKING_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 15_000 };
export const MAX_BOOKINGS_PER_PAGE = 50;

export const BOOKING_EXPIRY_QUEUE = 'booking-expiry';
export const BOOKING_EXPIRY_JOB = 'expire-eligible-holds';
export const BOOKING_EXPIRY_SCHEDULER_ID = 'booking-expiry-sweep';
export const DEFAULT_BOOKING_EXPIRY_INTERVAL_MS = 15_000;
export const MIN_BOOKING_EXPIRY_INTERVAL_MS = 5_000;
export const MAX_BOOKING_EXPIRY_INTERVAL_MS = 300_000;
export const DEFAULT_BOOKING_EXPIRY_BATCH_SIZE = 100;
export const MIN_BOOKING_EXPIRY_BATCH_SIZE = 1;
export const MAX_BOOKING_EXPIRY_BATCH_SIZE = 1_000;
export const MAX_BOOKING_EXPIRY_BATCHES_PER_RUN = 10;
