import type { BookingInput, BookingWindow } from '../model/booking';
import { localInputToIso } from '../model/booking-time';

export interface RequestKeyState {
  fingerprint: string;
  key: string;
}

export interface RequestIdentityInput {
  accountId?: string;
  courtId: string;
  timezone: string;
  window: BookingWindow;
}

export function requestFingerprint({
  accountId,
  courtId,
  timezone,
  window,
}: RequestIdentityInput) {
  const startsAt = localInputToIso(window.start, timezone);
  const endsAt = localInputToIso(window.end, timezone);
  return JSON.stringify([accountId, courtId, startsAt, endsAt]);
}

export function bookingRequestInput(
  identity: RequestIdentityInput,
  request: RequestKeyState,
): BookingInput {
  const fingerprint = requestFingerprint(identity);
  if (request.fingerprint !== fingerprint) {
    request.fingerprint = fingerprint;
    request.key = crypto.randomUUID();
  }
  const startsAt = localInputToIso(identity.window.start, identity.timezone);
  const endsAt = localInputToIso(identity.window.end, identity.timezone);
  return {
    policyAccepted: true,
    courtId: identity.courtId,
    startsAt,
    endsAt,
    idempotencyKey: request.key,
  };
}
