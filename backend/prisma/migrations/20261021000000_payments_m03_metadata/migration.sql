-- BE-PAY-04 / M-03: persist payOS create-response metadata (MIG-09).
-- Pure additive migration: nullable columns only, no backfill, no drops.
-- Rollback giữ columns (không DROP) để outstanding links/receipts/refunds
-- vẫn đọc được metadata (MIG-15).

ALTER TABLE "payment_requests"
  ADD COLUMN "viet_qr_payload" TEXT,
  ADD COLUMN "provider_account_name" VARCHAR(150),
  ADD COLUMN "provider_bin" VARCHAR(10);
