-- Bước 2 (Plan v2.4, chỉ đạo contract F1): OTP challenge 6 số lưu PostgreSQL
-- thay Map in-memory/Redis. Chỉ hash code; TTL 5 phút, tối đa 5 lần sai và
-- resend cooldown 60 giây được enforce ở use case với advisory lock theo email.
-- Không dùng enum mới để giữ migration đơn giản và rollback sạch.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.guest_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL,
  purpose varchar(40) NOT NULL DEFAULT 'GUEST_HOLD_CREATE',
  code_hash char(64) NOT NULL,
  attempts smallint NOT NULL DEFAULT 0,
  expires_at timestamptz(6) NOT NULL,
  consumed_at timestamptz(6),
  invalidated_at timestamptz(6),
  created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE INDEX guest_otp_challenges_email_created_at_idx
  ON public.guest_otp_challenges (email, created_at);

CREATE INDEX guest_otp_challenges_email_expires_at_idx
  ON public.guest_otp_challenges (email, expires_at);

COMMIT;

-- Rollback: DROP TABLE public.guest_otp_challenges;
