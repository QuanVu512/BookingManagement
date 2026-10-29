/**
 * Canonical Redis key for a court slot hold/create attempt.
 *
 * Format: `lock:court:${courtId}:${date}:${slot}` where `date` is the
 * calendar day of `startsAt` (UTC) and `slot` is the `HHmm-HHmm` window.
 * Two requests for the same court/window always contend on the same key,
 * even when their idempotency keys differ.
 */
export function buildSlotLockKey(
  courtId: string,
  startsAtIso: string,
  endsAtIso: string,
): string {
  const startsAt = new Date(startsAtIso);
  const endsAt = new Date(endsAtIso);
  const date = startsAt.toISOString().slice(0, 10);
  const slot = `${formatSlotTime(startsAt)}-${formatSlotTime(endsAt)}`;
  return `lock:court:${courtId}:${date}:${slot}`;
}

function formatSlotTime(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, '0');
  const minutes = String(value.getUTCMinutes()).padStart(2, '0');
  return `${hours}${minutes}`;
}

/** Suggested TTL window for the slot lock (5–10s per production policy). */
export const SLOT_LOCK_TTL_MS = 8_000;
