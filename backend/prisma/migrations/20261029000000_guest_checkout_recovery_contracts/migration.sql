-- Contract F1/F3/F6 (Plan v2.4, Bước 1).
-- PostgreSQL là authority cho guest checkout fencing: proof chỉ chuyển
-- ACTIVE -> CONSUMED bằng conditional update, và UNIQUE(otp_proof_id),
-- UNIQUE(booking_id) chặn hai intent thắng cùng một proof/booking.
-- Không có lease Redis nào được coi là bằng chứng rollback.

ALTER TYPE public.booking_token_purpose
  ADD VALUE IF NOT EXISTS 'CHECKOUT_RECOVERY';

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TYPE public.guest_otp_proof_status AS ENUM (
  'ACTIVE',
  'CONSUMED',
  'EXPIRED'
);

CREATE TYPE public.guest_checkout_intent_status AS ENUM (
  'COMMITTED',
  'EXPIRED'
);

CREATE TYPE public.outbox_message_status AS ENUM (
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'EXPIRED_SKIPPED'
);

CREATE TABLE public.guest_otp_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL,
  purpose varchar(40) NOT NULL DEFAULT 'GUEST_HOLD_CREATE',
  token_hash char(64) NOT NULL,
  status public.guest_otp_proof_status NOT NULL DEFAULT 'ACTIVE',
  fencing_generation bigint NOT NULL DEFAULT 0,
  expires_at timestamptz(6) NOT NULL,
  consumed_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX guest_otp_proofs_token_hash_key
  ON public.guest_otp_proofs (token_hash);
CREATE INDEX guest_otp_proofs_email_status_expires_at_idx
  ON public.guest_otp_proofs (email, status, expires_at);

CREATE TABLE public.guest_checkout_intents (
  checkout_intent_id uuid PRIMARY KEY,
  booking_id uuid NOT NULL,
  otp_proof_id uuid,
  recovery_secret_hash char(64) NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  fingerprint_version varchar(10) NOT NULL DEFAULT 'v1',
  fencing_generation bigint NOT NULL DEFAULT 0,
  status public.guest_checkout_intent_status NOT NULL DEFAULT 'COMMITTED',
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  expires_at timestamptz(6) NOT NULL,
  CONSTRAINT guest_checkout_intents_booking_id_key UNIQUE (booking_id),
  CONSTRAINT guest_checkout_intents_otp_proof_id_key UNIQUE (otp_proof_id),
  CONSTRAINT guest_checkout_intents_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES public.bookings (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT guest_checkout_intents_otp_proof_id_fkey
    FOREIGN KEY (otp_proof_id) REFERENCES public.guest_otp_proofs (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX guest_checkout_intents_expires_at_idx
  ON public.guest_checkout_intents (expires_at);

CREATE TABLE public.outbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type varchar(50) NOT NULL,
  aggregate_id uuid NOT NULL,
  event_type varchar(100) NOT NULL,
  payload_ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version varchar(30) NOT NULL,
  deduplication_key varchar(150) NOT NULL,
  status public.outbox_message_status NOT NULL DEFAULT 'QUEUED',
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz(6),
  expires_at timestamptz(6) NOT NULL,
  sent_at timestamptz(6),
  last_error text,
  created_at timestamptz(6) NOT NULL DEFAULT now(),
  updated_at timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT outbox_messages_deduplication_key_key UNIQUE (deduplication_key)
);

CREATE INDEX outbox_messages_status_next_retry_at_idx
  ON public.outbox_messages (status, next_retry_at);

COMMIT;

-- Rollback: dừng worker outbox trước, xóa outbox_messages,
-- guest_checkout_intents rồi guest_otp_proofs. Không xóa giá trị enum
-- CHECKOUT_RECOVERY khi còn token mang purpose đó; PostgreSQL không hỗ trợ
-- xóa một giá trị enum an toàn trong transaction.
