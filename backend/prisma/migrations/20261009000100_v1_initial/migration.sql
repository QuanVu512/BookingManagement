-- v1_initial: modular monolith persistence scaffold.
-- Authored from schema.prisma definitions; Prisma CLI is not installed locally.
-- NOT APPLIED or DB-tested. No seeds, bank calls or business handlers.
BEGIN;
CREATE SCHEMA IF NOT EXISTS "public";
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');
CREATE TYPE "role" AS ENUM ('CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN');
CREATE TYPE "court_type" AS ENUM ('STANDARD', 'VIP');
CREATE TYPE "court_status" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "booking_source" AS ENUM ('CUSTOMER_WEB', 'STAFF_COUNTER');
CREATE TYPE "booking_status" AS ENUM ('HOLDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "cancellation_rule" AS ENUM ('BEFORE_START', 'BEFORE_CHECKIN');
CREATE TYPE "occupancy_kind" AS ENUM ('BOOKING', 'BLOCK');
CREATE TYPE "occupancy_state" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "actor_type" AS ENUM ('SYSTEM', 'CUSTOMER', 'GUEST', 'STAFF');
CREATE TYPE "booking_token_purpose" AS ENUM ('CHECKIN', 'MANAGE_BOOKING');
CREATE TYPE "checkin_method" AS ENUM ('QR', 'MANUAL');
CREATE TYPE "cancellation_request_status" AS ENUM ('QUOTED', 'ACCEPTED', 'APPLIED', 'EXPIRED', 'SUPERSEDED', 'REJECTED');
CREATE TYPE "payment_reference_type" AS ENUM ('BOOKING');
CREATE TYPE "payment_purpose" AS ENUM ('PREPAYMENT', 'BALANCE');
CREATE TYPE "payment_method" AS ENUM ('PAYOS_TRANSFER', 'MANUAL_BANK_TRANSFER', 'CASH');
CREATE TYPE "receipt_method" AS ENUM ('BANK_TRANSFER', 'CASH');
CREATE TYPE "receipt_verification_status" AS ENUM ('UNVERIFIED', 'VERIFIED', 'REJECTED');
CREATE TYPE "receipt_allocation_status" AS ENUM ('UNALLOCATED', 'ALLOCATED', 'REFUND_REQUIRED');
CREATE TYPE "confirmation_source" AS ENUM ('WEBHOOK', 'PROVIDER_QUERY', 'STAFF');
CREATE TYPE "webhook_kind" AS ENUM ('PAYMENT', 'PAYOUT');
CREATE TYPE "webhook_status" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');
CREATE TYPE "refund_reason_type" AS ENUM ('CUSTOMER_CANCELLATION', 'LATE_PAYMENT', 'OVERPAYMENT', 'MERCHANT_CANCELLATION');
CREATE TYPE "refund_method" AS ENUM ('PAYOS_PAYOUT', 'MANUAL_BANK_TRANSFER', 'CASH');
CREATE TYPE "refund_status" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'CANCELLED');
CREATE TYPE "approval_source" AS ENUM ('MANAGER', 'SYSTEM_POLICY');
CREATE TYPE "refund_attempt_status" AS ENUM ('CREATED', 'SUBMITTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');
CREATE TYPE "notification_template" AS ENUM ('BOOKING_CONFIRMED', 'CHECKIN_CODE', 'BOOKING_CANCELLED', 'REFUND_UPDATED');
CREATE TYPE "notification_status" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED');
CREATE TYPE "payment_request_status" AS ENUM ('CREATING', 'PENDING', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'EXPIRED', 'FAILED');

CREATE TABLE "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "username" VARCHAR(100),
  "phone" VARCHAR(20) NOT NULL,
  "email" VARCHAR(254),
  "password_hash" VARCHAR(255) NOT NULL,
  "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
  "phone_verified_at" TIMESTAMPTZ(6),
  "email_verified_at" TIMESTAMPTZ(6),
  "token_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_profiles" (
  "user_id" UUID NOT NULL,
  "full_name" VARCHAR(150) NOT NULL,
  "avatar_url" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "user_roles" (
  "user_id" UUID NOT NULL,
  "role" "role" NOT NULL,
  "assigned_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id", "role")
);

CREATE TABLE "refresh_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "token_family_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "revoke_reason" VARCHAR(100),
  "replaced_by_token_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "address" VARCHAR(500) NOT NULL,
  "phone" VARCHAR(20) NOT NULL,
  "timezone" VARCHAR(50) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "courts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL,
  "code" VARCHAR(30) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "court_type" "court_type" NOT NULL DEFAULT 'STANDARD',
  "status" "court_status" NOT NULL DEFAULT 'ACTIVE',
  "cleanup_minutes" SMALLINT NOT NULL DEFAULT 15,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "branch_business_hours" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "branch_id" UUID NOT NULL,
  "day_of_week" SMALLINT NOT NULL,
  "open_time" TIME(6),
  "close_time" TIME(6),
  "is_closed" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "branch_business_hours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "price_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "court_id" UUID NOT NULL,
  "day_of_week" SMALLINT,
  "start_time" TIME(6) NOT NULL,
  "end_time" TIME(6) NOT NULL,
  "price_per_hour" NUMERIC(14,0) NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bookings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_code" VARCHAR(32) NOT NULL,
  "user_id" UUID,
  "branch_id" UUID NOT NULL,
  "court_id" UUID NOT NULL,
  "source" "booking_source" NOT NULL,
  "customer_name" VARCHAR(150) NOT NULL,
  "customer_email" VARCHAR(254) NOT NULL,
  "customer_phone" VARCHAR(20) NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "cleanup_minutes" SMALLINT NOT NULL DEFAULT 15,
  "total_amount" NUMERIC(14,0) NOT NULL,
  "prepayment_percent" NUMERIC(5,2) NOT NULL,
  "required_prepayment_amount" NUMERIC(14,0) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "status" "booking_status" NOT NULL DEFAULT 'HOLDING',
  "hold_expires_at" TIMESTAMPTZ(6) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6),
  "cancellation_rule" "cancellation_rule" NOT NULL,
  "cancellation_deadline_at" TIMESTAMPTZ(6),
  "cancellation_penalty_percent" NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  "policy_version" VARCHAR(30) NOT NULL,
  "policy_accepted_at" TIMESTAMPTZ(6) NOT NULL,
  "cancelled_at" TIMESTAMPTZ(6),
  "cancelled_by_user_id" UUID,
  "cancellation_reason" TEXT,
  "created_by_user_id" UUID,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "court_occupancies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "court_id" UUID NOT NULL,
  "booking_id" UUID,
  "kind" "occupancy_kind" NOT NULL,
  "occupied_from" TIMESTAMPTZ(6) NOT NULL,
  "occupied_until" TIMESTAMPTZ(6) NOT NULL,
  "state" "occupancy_state" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT,
  "created_by_user_id" UUID,
  "released_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "court_occupancies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_price_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "price_rule_id" UUID,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "price_per_hour" NUMERIC(14,0) NOT NULL,
  "amount" NUMERIC(14,0) NOT NULL,
  "description" VARCHAR(255),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_price_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_status_history" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "from_status" "booking_status",
  "to_status" "booking_status" NOT NULL,
  "actor_type" "actor_type" NOT NULL,
  "actor_user_id" UUID,
  "reason" TEXT,
  "correlation_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_access_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "purpose" "booking_token_purpose" NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "consumed_at" TIMESTAMPTZ(6),
  "revoked_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_access_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_checkins" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "token_id" UUID,
  "staff_user_id" UUID NOT NULL,
  "method" "checkin_method" NOT NULL,
  "checked_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "booking_checkins_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "booking_cancellation_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "booking_version" INTEGER NOT NULL,
  "total_amount_snapshot" NUMERIC(14,0) NOT NULL,
  "paid_amount_snapshot" NUMERIC(14,0) NOT NULL,
  "refunded_amount_snapshot" NUMERIC(14,0) NOT NULL,
  "reserved_refund_amount_snapshot" NUMERIC(14,0) NOT NULL,
  "penalty_percent" NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  "penalty_amount" NUMERIC(14,0) NOT NULL,
  "refund_amount" NUMERIC(14,0) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "policy_version" VARCHAR(30) NOT NULL,
  "policy_text_snapshot" TEXT NOT NULL,
  "payment_snapshot_revision" VARCHAR(100) NOT NULL,
  "actor_type" "actor_type" NOT NULL,
  "requested_by_user_id" UUID,
  "reason" TEXT,
  "status" "cancellation_request_status" NOT NULL DEFAULT 'QUOTED',
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "accepted_at" TIMESTAMPTZ(6),
  "applied_at" TIMESTAMPTZ(6),
  "idempotency_key" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_cancellation_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_code" VARCHAR(32) NOT NULL,
  "reference_type" "payment_reference_type" NOT NULL,
  "reference_id" UUID NOT NULL,
  "purpose" "payment_purpose" NOT NULL,
  "amount" NUMERIC(14,0) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "method" "payment_method" NOT NULL,
  "provider" VARCHAR(30),
  "provider_channel_id" VARCHAR(100),
  "provider_order_code" BIGINT,
  "provider_payment_link_id" VARCHAR(100),
  "checkout_url" TEXT,
  "status" "payment_request_status" NOT NULL DEFAULT 'CREATING',
  "expires_at" TIMESTAMPTZ(6),
  "idempotency_key" VARCHAR(100) NOT NULL,
  "created_by_user_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_transactions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_request_id" UUID,
  "provider" VARCHAR(30),
  "method" "receipt_method" NOT NULL,
  "receiving_account_key" VARCHAR(100) NOT NULL,
  "transaction_reference" VARCHAR(150),
  "amount" NUMERIC(14,0) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "verification_status" "receipt_verification_status" NOT NULL DEFAULT 'UNVERIFIED',
  "allocation_status" "receipt_allocation_status" NOT NULL DEFAULT 'UNALLOCATED',
  "confirmation_source" "confirmation_source" NOT NULL,
  "funds_received_at" TIMESTAMPTZ(6),
  "recorded_by_user_id" UUID,
  "verified_by_user_id" UUID,
  "verified_at" TIMESTAMPTZ(6),
  "verification_note" TEXT,
  "evidence_reference" TEXT,
  "review_reason" TEXT,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_webhook_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "provider" VARCHAR(30) NOT NULL,
  "provider_channel_id" VARCHAR(100) NOT NULL,
  "event_kind" "webhook_kind" NOT NULL,
  "provider_reference" VARCHAR(150),
  "deduplication_key" VARCHAR(200),
  "signature_valid" BOOLEAN NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "webhook_status" NOT NULL DEFAULT 'RECEIVED',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMPTZ(6),
  "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refund_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payment_transaction_id" UUID NOT NULL,
  "cancellation_request_id" UUID,
  "reason_type" "refund_reason_type" NOT NULL,
  "reason" TEXT NOT NULL,
  "amount" NUMERIC(14,0) NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'VND',
  "method" "refund_method" NOT NULL,
  "destination_bank_bin" VARCHAR(10),
  "destination_account_encrypted" BYTEA,
  "destination_account_last4" VARCHAR(4),
  "destination_account_name" VARCHAR(150),
  "status" "refund_status" NOT NULL DEFAULT 'REQUESTED',
  "requested_by_user_id" UUID,
  "approved_by_user_id" UUID,
  "approval_source" "approval_source",
  "approved_at" TIMESTAMPTZ(6),
  "rejection_reason" TEXT,
  "completed_at" TIMESTAMPTZ(6),
  "idempotency_key" VARCHAR(150) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refund_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "refund_request_id" UUID NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "method" "refund_method" NOT NULL,
  "provider" VARCHAR(30),
  "reference_id" VARCHAR(150) NOT NULL,
  "idempotency_key" VARCHAR(150) NOT NULL,
  "provider_payout_id" VARCHAR(150),
  "bank_transaction_reference" VARCHAR(150),
  "source_account_key" VARCHAR(100) NOT NULL,
  "amount" NUMERIC(14,0) NOT NULL,
  "fee_amount" NUMERIC(14,0),
  "status" "refund_attempt_status" NOT NULL DEFAULT 'CREATED',
  "provider_approval_state" VARCHAR(50),
  "provider_transaction_state" VARCHAR(50),
  "executed_by_user_id" UUID,
  "submitted_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "evidence_reference" TEXT,
  "failure_code" VARCHAR(100),
  "failure_message" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refund_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "booking_id" UUID NOT NULL,
  "recipient_email" VARCHAR(254) NOT NULL,
  "template_code" "notification_template" NOT NULL,
  "payload_encrypted" BYTEA,
  "deduplication_key" VARCHAR(150) NOT NULL,
  "status" "notification_status" NOT NULL DEFAULT 'QUEUED',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMPTZ(6),
  "provider_message_id" VARCHAR(150),
  "last_error" TEXT,
  "sent_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "aggregate_type" VARCHAR(50) NOT NULL,
  "aggregate_id" UUID NOT NULL,
  "event_type" VARCHAR(100) NOT NULL,
  "event_version" SMALLINT NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "published_at" TIMESTAMPTZ(6),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_retry_at" TIMESTAMPTZ(6),
  "last_error" TEXT,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users" ("username");
CREATE UNIQUE INDEX "users_phone_key" ON "users" ("phone");
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE INDEX "users_status_idx" ON "users" ("status");
CREATE INDEX "user_roles_assigned_by_user_id_idx" ON "user_roles" ("assigned_by_user_id");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens" ("token_hash");
CREATE INDEX "refresh_tokens_token_family_id_idx" ON "refresh_tokens" ("token_family_id");
CREATE INDEX "refresh_tokens_user_id_expires_at_idx" ON "refresh_tokens" ("user_id", "expires_at");
CREATE INDEX "refresh_tokens_replaced_by_token_id_idx" ON "refresh_tokens" ("replaced_by_token_id");
CREATE UNIQUE INDEX "branches_code_key" ON "branches" ("code");
CREATE UNIQUE INDEX "courts_branch_id_code_key" ON "courts" ("branch_id", "code");
CREATE UNIQUE INDEX "courts_id_branch_id_key" ON "courts" ("id", "branch_id");
CREATE INDEX "courts_branch_id_idx" ON "courts" ("branch_id");
CREATE UNIQUE INDEX "branch_business_hours_branch_id_day_of_week_key" ON "branch_business_hours" ("branch_id", "day_of_week");
CREATE INDEX "price_rules_court_id_is_active_effective_from_idx" ON "price_rules" ("court_id", "is_active", "effective_from");
CREATE UNIQUE INDEX "bookings_booking_code_key" ON "bookings" ("booking_code");
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings" ("idempotency_key");
CREATE UNIQUE INDEX "bookings_id_court_id_key" ON "bookings" ("id", "court_id");
CREATE INDEX "bookings_court_id_starts_at_idx" ON "bookings" ("court_id", "starts_at");
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings" ("user_id", "created_at");
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings" ("status", "hold_expires_at");
CREATE INDEX "bookings_customer_phone_idx" ON "bookings" ("customer_phone");
CREATE UNIQUE INDEX "court_occupancies_booking_id_key" ON "court_occupancies" ("booking_id");
CREATE INDEX "court_occupancies_court_id_occupied_from_idx" ON "court_occupancies" ("court_id", "occupied_from");
CREATE INDEX "court_occupancies_state_occupied_until_idx" ON "court_occupancies" ("state", "occupied_until");
CREATE INDEX "booking_price_items_booking_id_idx" ON "booking_price_items" ("booking_id");
CREATE INDEX "booking_status_history_booking_id_created_at_idx" ON "booking_status_history" ("booking_id", "created_at");
CREATE UNIQUE INDEX "booking_access_tokens_token_hash_key" ON "booking_access_tokens" ("token_hash");
CREATE UNIQUE INDEX "booking_access_tokens_id_booking_id_key" ON "booking_access_tokens" ("id", "booking_id");
CREATE INDEX "booking_access_tokens_booking_id_purpose_idx" ON "booking_access_tokens" ("booking_id", "purpose");
CREATE UNIQUE INDEX "booking_checkins_booking_id_key" ON "booking_checkins" ("booking_id");
CREATE INDEX "booking_checkins_staff_user_id_checked_in_at_idx" ON "booking_checkins" ("staff_user_id", "checked_in_at");
CREATE UNIQUE INDEX "booking_cancellation_requests_idempotency_key_key" ON "booking_cancellation_requests" ("idempotency_key");
CREATE INDEX "booking_cancellation_requests_booking_id_created_at_idx" ON "booking_cancellation_requests" ("booking_id", "created_at");
CREATE UNIQUE INDEX "payment_requests_payment_code_key" ON "payment_requests" ("payment_code");
CREATE UNIQUE INDEX "payment_requests_idempotency_key_key" ON "payment_requests" ("idempotency_key");
CREATE UNIQUE INDEX "payment_requests_provider_provider_channel_id_provider_orde_key" ON "payment_requests" ("provider", "provider_channel_id", "provider_order_code") WHERE "provider" IS NOT NULL AND "provider_channel_id" IS NOT NULL AND "provider_order_code" IS NOT NULL;
CREATE UNIQUE INDEX "payment_requests_provider_provider_channel_id_provider_paym_key" ON "payment_requests" ("provider", "provider_channel_id", "provider_payment_link_id") WHERE "provider" IS NOT NULL AND "provider_channel_id" IS NOT NULL AND "provider_payment_link_id" IS NOT NULL;
CREATE INDEX "payment_requests_reference_type_reference_id_idx" ON "payment_requests" ("reference_type", "reference_id");
CREATE UNIQUE INDEX "payment_transactions_idempotency_key_key" ON "payment_transactions" ("idempotency_key");
CREATE UNIQUE INDEX "payment_transactions_receiving_account_key_transaction_refe_key" ON "payment_transactions" ("receiving_account_key", "transaction_reference") WHERE "transaction_reference" IS NOT NULL;
CREATE INDEX "payment_transactions_payment_request_id_idx" ON "payment_transactions" ("payment_request_id");
CREATE INDEX "payment_transactions_verification_status_created_at_idx" ON "payment_transactions" ("verification_status", "created_at");
CREATE INDEX "payment_webhook_events_status_next_retry_at_idx" ON "payment_webhook_events" ("status", "next_retry_at");
CREATE UNIQUE INDEX "refund_requests_idempotency_key_key" ON "refund_requests" ("idempotency_key");
CREATE INDEX "refund_requests_payment_transaction_id_idx" ON "refund_requests" ("payment_transaction_id");
CREATE INDEX "refund_requests_status_created_at_idx" ON "refund_requests" ("status", "created_at");
CREATE INDEX "refund_requests_cancellation_request_id_idx" ON "refund_requests" ("cancellation_request_id");
CREATE UNIQUE INDEX "refund_attempts_reference_id_key" ON "refund_attempts" ("reference_id");
CREATE UNIQUE INDEX "refund_attempts_idempotency_key_key" ON "refund_attempts" ("idempotency_key");
CREATE UNIQUE INDEX "refund_attempts_refund_request_id_attempt_number_key" ON "refund_attempts" ("refund_request_id", "attempt_number");
CREATE UNIQUE INDEX "refund_attempts_provider_provider_payout_id_key" ON "refund_attempts" ("provider", "provider_payout_id") WHERE "provider" IS NOT NULL AND "provider_payout_id" IS NOT NULL;
CREATE INDEX "refund_attempts_status_updated_at_idx" ON "refund_attempts" ("status", "updated_at");
CREATE UNIQUE INDEX "notification_deliveries_deduplication_key_key" ON "notification_deliveries" ("deduplication_key");
CREATE INDEX "notification_deliveries_status_next_retry_at_idx" ON "notification_deliveries" ("status", "next_retry_at");
CREATE INDEX "notification_deliveries_booking_id_idx" ON "notification_deliveries" ("booking_id");
CREATE INDEX "outbox_events_published_at_next_retry_at_idx" ON "outbox_events" ("published_at", "next_retry_at");

ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_replaced_by_token_id_fkey"
  FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_tokens" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "courts"
  ADD CONSTRAINT "courts_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "branch_business_hours"
  ADD CONSTRAINT "branch_business_hours_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_court_id_fkey"
  FOREIGN KEY ("court_id") REFERENCES "courts" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_branch_id_fkey"
  FOREIGN KEY ("branch_id") REFERENCES "branches" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_court_id_branch_id_fkey"
  FOREIGN KEY ("court_id", "branch_id") REFERENCES "courts" ("id", "branch_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cancelled_by_user_id_fkey"
  FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "court_occupancies"
  ADD CONSTRAINT "court_occupancies_court_id_fkey"
  FOREIGN KEY ("court_id") REFERENCES "courts" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "court_occupancies"
  ADD CONSTRAINT "court_occupancies_booking_id_court_id_fkey"
  FOREIGN KEY ("booking_id", "court_id") REFERENCES "bookings" ("id", "court_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "court_occupancies"
  ADD CONSTRAINT "court_occupancies_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_price_items"
  ADD CONSTRAINT "booking_price_items_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_price_items"
  ADD CONSTRAINT "booking_price_items_price_rule_id_fkey"
  FOREIGN KEY ("price_rule_id") REFERENCES "price_rules" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_status_history"
  ADD CONSTRAINT "booking_status_history_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_status_history"
  ADD CONSTRAINT "booking_status_history_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_access_tokens"
  ADD CONSTRAINT "booking_access_tokens_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_checkins"
  ADD CONSTRAINT "booking_checkins_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_checkins"
  ADD CONSTRAINT "booking_checkins_token_id_booking_id_fkey"
  FOREIGN KEY ("token_id", "booking_id") REFERENCES "booking_access_tokens" ("id", "booking_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_checkins"
  ADD CONSTRAINT "booking_checkins_staff_user_id_fkey"
  FOREIGN KEY ("staff_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_reference_id_fkey"
  FOREIGN KEY ("reference_id") REFERENCES "bookings" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_payment_request_id_fkey"
  FOREIGN KEY ("payment_request_id") REFERENCES "payment_requests" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_verified_by_user_id_fkey"
  FOREIGN KEY ("verified_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_payment_transaction_id_fkey"
  FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_cancellation_request_id_fkey"
  FOREIGN KEY ("cancellation_request_id") REFERENCES "booking_cancellation_requests" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_refund_request_id_fkey"
  FOREIGN KEY ("refund_request_id") REFERENCES "refund_requests" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_executed_by_user_id_fkey"
  FOREIGN KEY ("executed_by_user_id") REFERENCES "users" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SQL-only constraints are deliberately tracked in migrations, not Prisma PSL.
ALTER TABLE "users"
  ADD CONSTRAINT "users_token_version_nonnegative_check"
  CHECK (
    "token_version" >= 0
  );
ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_nonempty_check"
  CHECK (
    length(btrim("phone")) > 0
  );
ALTER TABLE "users"
  ADD CONSTRAINT "users_username_nonempty_check"
  CHECK (
    "username" IS NULL
    OR length(btrim("username")) > 0
  );
ALTER TABLE "users"
  ADD CONSTRAINT "users_email_nonempty_check"
  CHECK (
    "email" IS NULL
    OR length(btrim("email")) > 0
  );
ALTER TABLE "user_profiles"
  ADD CONSTRAINT "user_profiles_full_name_nonempty_check"
  CHECK (
    length(btrim("full_name")) > 0
  );
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_expiry_after_creation_check"
  CHECK (
    "expires_at" > "created_at"
  );
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_no_self_rotation_check"
  CHECK (
    "replaced_by_token_id" IS NULL
    OR "replaced_by_token_id" <> "id"
  );
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_hash_hex_check"
  CHECK (
    "token_hash" ~ '^[0-9a-f]{64}$'
  );
ALTER TABLE "branches"
  ADD CONSTRAINT "branches_code_nonempty_check"
  CHECK (
    length(btrim("code")) > 0
  );
ALTER TABLE "courts"
  ADD CONSTRAINT "courts_cleanup_minimum_check"
  CHECK (
    "cleanup_minutes" >= 15
  );
ALTER TABLE "courts"
  ADD CONSTRAINT "courts_code_nonempty_check"
  CHECK (
    length(btrim("code")) > 0
  );
ALTER TABLE "branch_business_hours"
  ADD CONSTRAINT "branch_business_hours_iso_day_check"
  CHECK (
    "day_of_week" BETWEEN 1
    AND 7
  );
ALTER TABLE "branch_business_hours"
  ADD CONSTRAINT "branch_business_hours_open_or_closed_check"
  CHECK (
    ("is_closed"
    AND "open_time" IS NULL
    AND "close_time" IS NULL)
    OR (NOT "is_closed"
    AND "open_time" IS NOT NULL
    AND "close_time" IS NOT NULL
    AND "close_time" > "open_time")
  );
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_iso_day_check"
  CHECK (
    "day_of_week" IS NULL
    OR "day_of_week" BETWEEN 1
    AND 7
  );
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_time_range_check"
  CHECK (
    "end_time" > "start_time"
  );
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_amount_nonnegative_check"
  CHECK (
    "price_per_hour" >= 0
  );
ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_effective_range_check"
  CHECK (
    "effective_to" IS NULL
    OR "effective_to" >= "effective_from"
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_playing_interval_check"
  CHECK (
    "ends_at" > "starts_at"
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cleanup_minimum_check"
  CHECK (
    "cleanup_minutes" >= 15
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_amounts_check"
  CHECK (
    "total_amount" > 0
    AND "required_prepayment_amount" > 0
    AND "required_prepayment_amount" <= "total_amount"
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_prepayment_choice_check"
  CHECK (
    "prepayment_percent" IN (30, 100)
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_guest_full_prepayment_check"
  CHECK (
    "user_id" IS NOT NULL
    OR ("prepayment_percent" = 100
    AND "required_prepayment_amount" = "total_amount")
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_full_prepayment_amount_check"
  CHECK (
    "prepayment_percent" <> 100
    OR "required_prepayment_amount" = "total_amount"
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_hold_deadline_check"
  CHECK (
    "hold_expires_at" > "created_at"
    AND "hold_expires_at" <= "starts_at"
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cancellation_deadline_check"
  CHECK (
    ("cancellation_rule" = 'BEFORE_START'
    AND "cancellation_deadline_at" IS NOT NULL
    AND "cancellation_deadline_at" = "starts_at")
    OR ("cancellation_rule" = 'BEFORE_CHECKIN'
    AND "cancellation_deadline_at" IS NULL)
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_penalty_percentage_check"
  CHECK (
    "cancellation_penalty_percent" BETWEEN 0
    AND 100
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_version_nonnegative_check"
  CHECK (
    "version" >= 0
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_contact_nonempty_check"
  CHECK (
    length(btrim("customer_name")) > 0
    AND length(btrim("customer_email")) > 0
    AND length(btrim("customer_phone")) > 0
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_currency_vnd_check"
  CHECK (
    "currency" = 'VND'
  );
ALTER TABLE "bookings"
  ADD CONSTRAINT "bookings_cancellation_timestamp_check"
  CHECK (
    "status" <> 'CANCELLED'
    OR "cancelled_at" IS NOT NULL
  );
ALTER TABLE "court_occupancies"
  ADD CONSTRAINT "court_occupancies_occupied_interval_check"
  CHECK (
    "occupied_until" > "occupied_from"
  );
ALTER TABLE "court_occupancies"
  ADD CONSTRAINT "court_occupancies_booking_or_block_check"
  CHECK (
    ("kind" = 'BOOKING'
    AND "booking_id" IS NOT NULL)
    OR ("kind" = 'BLOCK'
    AND "booking_id" IS NULL
    AND "reason" IS NOT NULL
    AND length(btrim("reason")) > 0)
  );
ALTER TABLE "court_occupancies"
  ADD CONSTRAINT "court_occupancies_release_timestamp_check"
  CHECK (
    ("state" = 'ACTIVE'
    AND "released_at" IS NULL)
    OR ("state" = 'RELEASED'
    AND "released_at" IS NOT NULL)
  );
ALTER TABLE "booking_price_items"
  ADD CONSTRAINT "booking_price_items_price_interval_check"
  CHECK (
    "ends_at" > "starts_at"
  );
ALTER TABLE "booking_price_items"
  ADD CONSTRAINT "booking_price_items_duration_positive_check"
  CHECK (
    "duration_minutes" > 0
  );
ALTER TABLE "booking_price_items"
  ADD CONSTRAINT "booking_price_items_amount_nonnegative_check"
  CHECK (
    "price_per_hour" >= 0
    AND "amount" >= 0
  );
ALTER TABLE "booking_status_history"
  ADD CONSTRAINT "booking_status_history_actor_identity_check"
  CHECK (
    ("actor_type" IN ('CUSTOMER', 'STAFF')
    AND "actor_user_id" IS NOT NULL)
    OR ("actor_type" IN ('GUEST', 'SYSTEM')
    AND "actor_user_id" IS NULL)
  );
ALTER TABLE "booking_access_tokens"
  ADD CONSTRAINT "booking_access_tokens_expiry_after_creation_check"
  CHECK (
    "expires_at" > "created_at"
  );
ALTER TABLE "booking_access_tokens"
  ADD CONSTRAINT "booking_access_tokens_hash_hex_check"
  CHECK (
    "token_hash" ~ '^[0-9a-f]{64}$'
  );
ALTER TABLE "booking_checkins"
  ADD CONSTRAINT "booking_checkins_qr_token_check"
  CHECK (
    "method" <> 'QR'
    OR "token_id" IS NOT NULL
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_version_nonnegative_check"
  CHECK (
    "booking_version" >= 0
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_amount_bounds_check"
  CHECK (
    "total_amount_snapshot" > 0
    AND "paid_amount_snapshot" >= 0
    AND "refunded_amount_snapshot" >= 0
    AND "reserved_refund_amount_snapshot" >= 0
    AND "penalty_amount" >= 0
    AND "penalty_amount" <= "total_amount_snapshot"
    AND "refund_amount" >= 0
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_refund_bound_check"
  CHECK (
    "refunded_amount_snapshot" + "reserved_refund_amount_snapshot" <= "paid_amount_snapshot"
    AND "refund_amount" <= greatest(0, "paid_amount_snapshot" - "refunded_amount_snapshot" - "reserved_refund_amount_snapshot" - "penalty_amount")
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_penalty_percentage_check"
  CHECK (
    "penalty_percent" BETWEEN 0
    AND 100
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_expiry_after_creation_check"
  CHECK (
    "expires_at" > "created_at"
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_consent_required_check"
  CHECK (
    "status" NOT IN ('ACCEPTED', 'APPLIED')
    OR "accepted_at" IS NOT NULL
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_applied_timestamp_check"
  CHECK (
    "status" <> 'APPLIED'
    OR "applied_at" IS NOT NULL
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_actor_identity_check"
  CHECK (
    ("actor_type" IN ('CUSTOMER', 'STAFF')
    AND "requested_by_user_id" IS NOT NULL)
    OR ("actor_type" = 'GUEST'
    AND "requested_by_user_id" IS NULL)
  );
ALTER TABLE "booking_cancellation_requests"
  ADD CONSTRAINT "booking_cancellation_requests_currency_vnd_check"
  CHECK (
    "currency" = 'VND'
  );
ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_positive_amount_check"
  CHECK (
    "amount" > 0
  );
ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_payos_channel_check"
  CHECK (
    ("method" = 'PAYOS_TRANSFER'
    AND "provider" IS NOT NULL
    AND "provider" = 'PAYOS'
    AND "provider_channel_id" IS NOT NULL)
    OR ("method" <> 'PAYOS_TRANSFER'
    AND "provider" IS NULL)
  );
ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_safe_order_code_check"
  CHECK (
    "provider_order_code" IS NULL
    OR "provider_order_code" BETWEEN 1
    AND 9007199254740991
  );
ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_currency_vnd_check"
  CHECK (
    "currency" = 'VND'
  );
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_positive_amount_check"
  CHECK (
    "amount" > 0
  );
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_verified_timestamps_check"
  CHECK (
    "verification_status" <> 'VERIFIED'
    OR ("verified_at" IS NOT NULL
    AND "funds_received_at" IS NOT NULL)
  );
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_verified_bank_reference_check"
  CHECK (
    "verification_status" <> 'VERIFIED'
    OR "method" <> 'BANK_TRANSFER'
    OR ("transaction_reference" IS NOT NULL
    AND length(btrim("transaction_reference")) > 0)
  );
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_staff_verification_check"
  CHECK (
    "verification_status" <> 'VERIFIED'
    OR "confirmation_source" <> 'STAFF'
    OR "verified_by_user_id" IS NOT NULL
  );
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_cash_actor_check"
  CHECK (
    "method" <> 'CASH'
    OR ("confirmation_source" = 'STAFF'
    AND "recorded_by_user_id" IS NOT NULL)
  );
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_allocation_verified_check"
  CHECK (
    "allocation_status" <> 'ALLOCATED'
    OR ("verification_status" = 'VERIFIED'
    AND "payment_request_id" IS NOT NULL)
  );
ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_currency_vnd_check"
  CHECK (
    "currency" = 'VND'
  );
ALTER TABLE "payment_webhook_events"
  ADD CONSTRAINT "payment_webhook_events_attempts_nonnegative_check"
  CHECK (
    "attempt_count" >= 0
  );
ALTER TABLE "payment_webhook_events"
  ADD CONSTRAINT "payment_webhook_events_valid_dedup_key_check"
  CHECK (
    NOT "signature_valid"
    OR ("deduplication_key" IS NOT NULL
    AND length(btrim("deduplication_key")) > 0)
  );
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_positive_amount_check"
  CHECK (
    "amount" > 0
  );
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_customer_cancellation_reference_check"
  CHECK (
    "reason_type" <> 'CUSTOMER_CANCELLATION'
    OR "cancellation_request_id" IS NOT NULL
  );
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_approval_record_check"
  CHECK (
    "status" NOT IN ('APPROVED', 'PROCESSING', 'COMPLETED')
    OR ("approval_source" IS NOT NULL
    AND "approved_at" IS NOT NULL)
  );
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_manager_approval_check"
  CHECK (
    "approval_source" IS NULL
    OR "approval_source" <> 'MANAGER'
    OR "approved_by_user_id" IS NOT NULL
  );
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_completed_timestamp_check"
  CHECK (
    "status" <> 'COMPLETED'
    OR "completed_at" IS NOT NULL
  );
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_bank_destination_check"
  CHECK (
    "method" = 'CASH'
    OR "status" NOT IN ('APPROVED', 'PROCESSING', 'COMPLETED')
    OR ("destination_bank_bin" IS NOT NULL
    AND "destination_account_encrypted" IS NOT NULL
    AND "destination_account_name" IS NOT NULL)
  );
ALTER TABLE "refund_requests"
  ADD CONSTRAINT "refund_requests_currency_vnd_check"
  CHECK (
    "currency" = 'VND'
  );
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_attempt_positive_check"
  CHECK (
    "attempt_number" > 0
  );
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_amount_bounds_check"
  CHECK (
    "amount" > 0
    AND ("fee_amount" IS NULL
    OR "fee_amount" >= 0)
  );
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_success_timestamp_check"
  CHECK (
    "status" <> 'SUCCEEDED'
    OR "completed_at" IS NOT NULL
  );
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_manual_executor_check"
  CHECK (
    "method" = 'PAYOS_PAYOUT'
    OR "executed_by_user_id" IS NOT NULL
  );
ALTER TABLE "refund_attempts"
  ADD CONSTRAINT "refund_attempts_payout_provider_check"
  CHECK (
    "method" <> 'PAYOS_PAYOUT'
    OR ("provider" IS NOT NULL
    AND "provider" = 'PAYOS')
  );
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_attempts_nonnegative_check"
  CHECK (
    "attempt_count" >= 0
  );
ALTER TABLE "notification_deliveries"
  ADD CONSTRAINT "notification_deliveries_sent_timestamp_check"
  CHECK (
    "status" <> 'SENT'
    OR "sent_at" IS NOT NULL
  );
ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_positive_version_check"
  CHECK (
    "event_version" > 0
  );
ALTER TABLE "outbox_events"
  ADD CONSTRAINT "outbox_events_attempts_nonnegative_check"
  CHECK (
    "attempt_count" >= 0
  );

-- Half-open active intervals: an end boundary may equal the next start.
-- Occupied end includes the nonbillable cleaning buffer for bookings.
ALTER TABLE "court_occupancies" ADD CONSTRAINT "court_occupancies_no_active_overlap"
  EXCLUDE USING gist (
    "court_id" WITH =,
    tstzrange("occupied_from", "occupied_until", '[)') WITH &&
  ) WHERE ("state" = 'ACTIVE');

CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email")) WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username")) WHERE "username" IS NOT NULL;
CREATE UNIQUE INDEX "cancellation_one_applied_per_booking" ON "booking_cancellation_requests" ("booking_id") WHERE "status" = 'APPLIED';
CREATE UNIQUE INDEX "webhook_valid_business_dedup" ON "payment_webhook_events" ("provider", "provider_channel_id", "event_kind", "deduplication_key") WHERE "signature_valid";
CREATE UNIQUE INDEX "refund_attempt_one_live_or_successful" ON "refund_attempts" ("refund_request_id") WHERE "status" IN ('CREATED', 'SUBMITTED', 'PROCESSING', 'UNKNOWN', 'SUCCEEDED');
CREATE UNIQUE INDEX "refund_outgoing_bank_receipt_key" ON "refund_attempts" ("source_account_key", "bank_transaction_reference") WHERE "bank_transaction_reference" IS NOT NULL;

-- Keep updated_at correct even for a future SQL maintenance operation.
CREATE FUNCTION "touch_updated_at"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER "users_touch_updated_at" BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "user_profiles_touch_updated_at" BEFORE UPDATE ON "user_profiles" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "branches_touch_updated_at" BEFORE UPDATE ON "branches" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "courts_touch_updated_at" BEFORE UPDATE ON "courts" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "branch_business_hours_touch_updated_at" BEFORE UPDATE ON "branch_business_hours" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "price_rules_touch_updated_at" BEFORE UPDATE ON "price_rules" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "bookings_touch_updated_at" BEFORE UPDATE ON "bookings" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "court_occupancies_touch_updated_at" BEFORE UPDATE ON "court_occupancies" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "booking_cancellation_requests_touch_updated_at" BEFORE UPDATE ON "booking_cancellation_requests" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "payment_requests_touch_updated_at" BEFORE UPDATE ON "payment_requests" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "payment_transactions_touch_updated_at" BEFORE UPDATE ON "payment_transactions" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "refund_requests_touch_updated_at" BEFORE UPDATE ON "refund_requests" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "refund_attempts_touch_updated_at" BEFORE UPDATE ON "refund_attempts" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();
CREATE TRIGGER "notification_deliveries_touch_updated_at" BEFORE UPDATE ON "notification_deliveries" FOR EACH ROW EXECUTE FUNCTION "touch_updated_at"();

COMMIT;
