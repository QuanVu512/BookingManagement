/**
 * Distributed slot-lock port owned by the Booking domain.
 *
 * The Redis adapter is a best-effort early guard against two requests
 * grabbing the same court window in the same millisecond. The
 * `court_occupancies_no_active_overlap` exclusion constraint stays the
 * authoritative backstop: if the lock is unavailable, the use case proceeds
 * and the database still rejects a second overlapping ACTIVE occupancy.
 */
export interface SlotLockLease {
  /** Redis key that was acquired, e.g. `lock:court:<id>:<date>:<slot>`. */
  readonly key: string;
  /** Frees the lease. Safe to call more than once. */
  release(): Promise<void>;
}

export abstract class BookingSlotLock {
  /**
   * Acquires the slot lock. Resolves with a lease on success, or `null`
   * when another request already holds the lock (caller maps to 409).
   * May throw on infrastructure failure; the use case decides fail-open.
   */
  abstract acquire(
    key: string,
    ttlMs: number,
  ): Promise<SlotLockLease | null>;
}
