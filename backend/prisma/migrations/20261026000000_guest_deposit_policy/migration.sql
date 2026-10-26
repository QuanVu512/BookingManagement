-- The active member AND guest create-hold policy is a mandatory 30% deposit.
-- Persisted percentages are snapshots, not the current policy configuration:
-- retain 30/100 and their monetary CHECKs so historical 100% bookings remain
-- readable/updatable. Do not rewrite receipt, pricing or cancellation snapshots.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- This role-dependent restriction predates the shared 30% creation policy.
-- The application owns the active rule; SQL continues to validate snapshots.
ALTER TABLE public.bookings
  DROP CONSTRAINT bookings_guest_full_prepayment_check;

COMMENT ON COLUMN public.bookings.prepayment_percent IS
  'Immutable pricing snapshot (30 or historical 100). New member/guest holds use the active 30% application policy.';
COMMIT;

-- Rollback must not blindly restore the old guest-only CHECK after 30% rows
-- have been written. Stop new guest writes and assess compatibility first;
-- never convert historical booking amounts to force a constraint to validate.
