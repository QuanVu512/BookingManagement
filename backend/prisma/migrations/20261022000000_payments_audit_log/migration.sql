-- BE-PAY-04/17: PaymentAuditLog append-only (MIG-15).
-- Additive only. Không backfill. Rollback giữ bảng.
-- Quy ước code: chỉ INSERT + SELECT; không UPDATE/DELETE từ app.

CREATE TABLE "payment_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_type" "actor_type" NOT NULL,
  "actor_user_id" UUID,
  "action" VARCHAR(50) NOT NULL,
  "entity_type" VARCHAR(50) NOT NULL,
  "entity_id" UUID NOT NULL,
  "booking_id" UUID,
  "ip_hash" CHAR(64),
  "result" VARCHAR(20) NOT NULL,
  "detail" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payment_audit_logs_entity_type_entity_id_idx"
  ON "payment_audit_logs" ("entity_type", "entity_id");
CREATE INDEX "payment_audit_logs_booking_id_created_at_idx"
  ON "payment_audit_logs" ("booking_id", "created_at");
