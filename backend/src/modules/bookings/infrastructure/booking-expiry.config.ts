import type { ConfigService } from '@nestjs/config';
import {
  DEFAULT_BOOKING_EXPIRY_BATCH_SIZE,
  DEFAULT_BOOKING_EXPIRY_INTERVAL_MS,
  MAX_BOOKING_EXPIRY_BATCH_SIZE,
  MAX_BOOKING_EXPIRY_INTERVAL_MS,
  MIN_BOOKING_EXPIRY_BATCH_SIZE,
  MIN_BOOKING_EXPIRY_INTERVAL_MS,
} from '../booking.constants.js';

export function bookingExpiryIntervalMs(config: ConfigService): number {
  return boundedInteger(
    config.get<string>('BOOKING_EXPIRY_INTERVAL_MS'),
    DEFAULT_BOOKING_EXPIRY_INTERVAL_MS,
    MIN_BOOKING_EXPIRY_INTERVAL_MS,
    MAX_BOOKING_EXPIRY_INTERVAL_MS,
    'BOOKING_EXPIRY_INTERVAL_MS',
  );
}

export function bookingExpiryBatchSize(config: ConfigService): number {
  return boundedInteger(
    config.get<string>('BOOKING_EXPIRY_BATCH_SIZE'),
    DEFAULT_BOOKING_EXPIRY_BATCH_SIZE,
    MIN_BOOKING_EXPIRY_BATCH_SIZE,
    MAX_BOOKING_EXPIRY_BATCH_SIZE,
    'BOOKING_EXPIRY_BATCH_SIZE',
  );
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}
