import type {
  BookingInput,
  BookingWindow,
  ServiceSelection,
} from '../model/booking';
import { localInputToIso } from '../model/booking-time';

export interface RequestKeyState {
  fingerprint: string;
  key: string;
}

export interface RequestIdentityInput {
  services?: ServiceSelection[];
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
  services,
}: RequestIdentityInput) {
  const startsAt = localInputToIso(window.start, timezone);
  const endsAt = localInputToIso(window.end, timezone);
  const selection = [...(services ?? [])]
    .sort((left, right) => left.productId.localeCompare(right.productId))
    .map(({ productId, quantity }) => [productId, quantity]);
  return JSON.stringify([accountId, courtId, startsAt, endsAt, selection]);
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
    ...(identity.services?.length ? { services: identity.services } : {}),
  };
}
