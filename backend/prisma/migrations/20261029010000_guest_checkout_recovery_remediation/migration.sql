-- Remediation Bước 1 (Plan v2.4, plan khắc phục PLAN-GUEST-RECOVERY-STEP1-REMEDIATION-20261029).
-- 1) Mọi guest checkout intent phải gắn một OTP proof: bỏ nullable.
-- 2) Outbox retention: tombstone zero-length bytea + purged_at, giữ row để
--    bảo toàn audit, deduplication_key và kết quả gửi cuối cùng.
-- Không thêm giá trị enum mới để tránh giới hạn "không dùng enum mới trong
-- cùng transaction" của PostgreSQL; purge giữ nguyên status giao nhận.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.guest_checkout_intents
  ALTER COLUMN otp_proof_id SET NOT NULL;

ALTER TABLE public.outbox_messages
  ADD COLUMN purged_at timestamptz(6);

ALTER TABLE public.outbox_messages
  ADD CONSTRAINT outbox_messages_payload_shape_check
  CHECK (
    (
      purged_at IS NULL
      AND octet_length(payload_ciphertext) > 0
      AND octet_length(iv) = 12
      AND octet_length(auth_tag) = 16
    )
    OR (
      purged_at IS NOT NULL
      AND octet_length(payload_ciphertext) = 0
      AND octet_length(iv) = 0
      AND octet_length(auth_tag) = 0
    )
  );

COMMIT;

-- Rollback (chỉ khi chưa có row bị purge):
-- ALTER TABLE public.outbox_messages DROP CONSTRAINT outbox_messages_payload_shape_check;
-- ALTER TABLE public.outbox_messages DROP COLUMN purged_at;
-- ALTER TABLE public.guest_checkout_intents ALTER COLUMN otp_proof_id DROP NOT NULL;
