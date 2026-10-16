-- Scope authenticated retries to the account. Keep global guest deduplication.
CREATE UNIQUE INDEX "bookings_user_id_idempotency_key_key" ON "bookings" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX "bookings_guest_idempotency_key_key" ON "bookings" ("idempotency_key") WHERE "user_id" IS NULL;
DROP INDEX "bookings_idempotency_key_key";
-- Rollback (only after checking cross-user keys for duplicates): drop the two
-- new indexes and recreate bookings_idempotency_key_key on idempotency_key.
