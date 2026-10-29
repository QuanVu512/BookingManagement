import { createHash } from 'node:crypto';
import { Role } from '../../../enums/index.js';
import { BookingNotFoundError } from './booking-errors.js';

export interface BookingOwnershipCheck {
  /** Owner stored on the booking; `null` for guest (vãng lai) bookings. */
  ownerUserId: string | null;
  /** Authenticated caller id taken from the verified JWT (`request.user`). */
  requesterUserId: string;
  /** Current DB roles of the caller, granted by `JwtStrategy`. */
  requesterRoles?: Role[];
}

/**
 * Central ownership policy for member bookings.
 *
 * - Owner (`booking.userId === request.user.sub`) passes.
 * - `STAFF`/`MANAGER`/`ADMIN` pass for counter support.
 * - Everyone else gets `BookingNotFoundError` (mapped to HTTP 404) so an
 *   attacker cannot probe valid booking ids by watching 403 vs 404.
 *
 * `userId` is never read from body/query: controllers only pass the JWT
 * subject via `@CurrentUser('userId')`, and DTOs carry no `userId` field.
 */
export function assertBookingOwnership(check: BookingOwnershipCheck): void {
  if (check.ownerUserId !== null && check.ownerUserId === check.requesterUserId)
    return;
  const roles = check.requesterRoles ?? [];
  if (
    roles.includes(Role.STAFF) ||
    roles.includes(Role.MANAGER) ||
    roles.includes(Role.ADMIN)
  )
    return;
  throw new BookingNotFoundError('Không tìm thấy booking.');
}

/** SHA-256 of the caller IP for audit logs; never stores the raw IP. */
export function hashAuditIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(ip).digest('hex');
}
