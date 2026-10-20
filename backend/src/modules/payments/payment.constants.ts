/**
 * BE-PAY-01/02 — Payment policy constants (MIG-02, MIG-13, MIG-20).
 * Mọi ngưỡng nghiệp vụ tiền đều nằm ở đây; OD chưa chốt bị giữ ở nhánh
 * disabled thay vì tự mặc định giá trị thay business.
 */
export const PAYMENT_POLICY_VERSION = 'payments-v2.0';

export const PREPAYMENT_PERCENT = 30;
export const FULL_PAYMENT_PERCENT = 100;
export const ALLOWED_PREPAYMENT_PERCENTS = [30, 100] as const;

/** VND nguyên; không dùng float cho nghiệp vụ tiền. */
export const VND_DECIMALS = 0;
export const MAX_VND_AMOUNT = 999_999_999_999;

/** Link payOS TTL (phút). OD-11 chưa chốt quan hệ với hold TTL: giữ nhánh
 *  disabled — runtime dùng min(linkTtl, hold còn lại). */
export const PAYMENT_LINK_TTL_MINUTES = 15;

/** Refund hai phase thủ công (MIG-04): evidence tối thiểu để COMPLETE. */
export const MANUAL_REFUND_EVIDENCE_MIN_LENGTH = 6;

/** Payout qua API: server flag OFF cho đến khi merchant eligibility được
 *  xác minh (MIG-04, MIG-20). Không bật bằng flag frontend. */
export const PAYOUT_ENABLED = false;

/** Kill-switch chỉ tắt tạo link/thu/khởi tạo chi mới; giữ webhook ingestion,
 *  authenticated reads, pending refunds và reconciliation (MIG-08). */
export const PAYMENTS_CREATION_ENABLED = true;

export const PAYMENT_TRANSACTION_OPTIONS = {
  isolationLevel: 'ReadCommitted' as const,
  timeout: 10_000,
  maxWait: 5_000,
};

export type AllowedPrepaymentPercent =
  (typeof ALLOWED_PREPAYMENT_PERCENTS)[number];

export function isAllowedPrepaymentPercent(
  value: unknown,
): value is AllowedPrepaymentPercent {
  return (
    value === PREPAYMENT_PERCENT || value === FULL_PAYMENT_PERCENT
  );
}
