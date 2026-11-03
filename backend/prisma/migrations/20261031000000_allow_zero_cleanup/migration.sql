-- Allow cleanup_minutes to be 0 or positive for courts and bookings
ALTER TABLE "courts" DROP CONSTRAINT IF EXISTS "courts_cleanup_minimum_check";
ALTER TABLE "courts"
  ADD CONSTRAINT "courts_cleanup_minimum_check"
  CHECK ("cleanup_minutes" >= 0);

ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_cleanup_minimum_check";
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cleanup_minimum_check"
  CHECK ("cleanup_minutes" >= 0);
