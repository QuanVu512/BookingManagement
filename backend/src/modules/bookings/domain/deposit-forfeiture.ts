import { prepaymentAmountFor } from '../../payments/domain/money.js';

/**
 * D16 — Tịch thu deposit cho NO_SHOW / hủy muộn của staff (domain thuần).
 * - Deposit = 30% tổng bất biến (tái dùng prepaymentAmountFor: integer VND,
 *   HALF_UP — đúng "approved rounding rules", áp dụng cả khi prepaid 100%).
 * - Pool hoàn = max(tổng refundable từng receipt − deposit, 0), phân bổ FIFO,
 *   mỗi line không vượt refundable của chính receipt đó.
 * - paid30 → hoàn 0 (giữ deposit, waive 70% chưa thu); paid100 → hoàn 70%.
 * - Không bao giờ hoàn vượt tiền verified đã nhận (pool tính từ receipts).
 * - Không cộng dồn với phí hủy thường 10%: caller chọn MỘT chính sách.
 */
export interface ForfeitureReceiptInput {
  receiptId: string;
  creditedAmount: number;
}

export interface ForfeitureLine {
  receiptId: string;
  refundAmount: number;
}

export interface ForfeitureQuote {
  /** 30% tổng — mức tịch thu tối đa. */
  depositAmount: number;
  /** Phần thực giữ lại = min(pool, deposit). */
  forfeitedAmount: number;
  lines: ForfeitureLine[];
  totalRefund: number;
}

function assertVndInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} phải là số nguyên VND không âm.`);
  }
  return value;
}

export function quoteDepositForfeiture(input: {
  totalAmount: number;
  receipts: ForfeitureReceiptInput[];
  reservedByReceipt?: Record<string, number>;
  completedByReceipt?: Record<string, number>;
}): ForfeitureQuote {
  const total = assertVndInteger(input.totalAmount, 'totalAmount');
  const depositAmount = prepaymentAmountFor(total, 30);
  const reserved = input.reservedByReceipt ?? {};
  const completed = input.completedByReceipt ?? {};
  const refundables = input.receipts.map((receipt) => {
    const credited = assertVndInteger(receipt.creditedAmount, 'creditedAmount');
    const held =
      assertVndInteger(reserved[receipt.receiptId] ?? 0, 'reservedAmount') +
      assertVndInteger(completed[receipt.receiptId] ?? 0, 'completedAmount');
    return { receiptId: receipt.receiptId, refundable: Math.max(credited - held, 0) };
  });
  const pool = refundables.reduce((sum, row) => sum + row.refundable, 0);
  let remaining = Math.max(pool - depositAmount, 0);
  const lines: ForfeitureLine[] = [];
  for (const row of refundables) {
    if (remaining <= 0) break;
    const share = Math.min(row.refundable, remaining);
    if (share <= 0) continue;
    lines.push({ receiptId: row.receiptId, refundAmount: share });
    remaining -= share;
  }
  const totalRefund = lines.reduce((sum, line) => sum + line.refundAmount, 0);
  return {
    depositAmount,
    forfeitedAmount: pool - totalRefund,
    lines,
    totalRefund,
  };
}

/** Cửa sổ hủy muộn do staff: [startsAt − 12h, endsAt). Ngoài cửa sổ: flow thường. */
export const LATE_CANCEL_WINDOW_HOURS = 12;

export function isInLateCancelWindow(input: {
  nowMs: number;
  startsAtMs: number;
  endsAtMs: number;
}): boolean {
  return (
    input.nowMs >=
      input.startsAtMs - LATE_CANCEL_WINDOW_HOURS * 3_600_000 &&
    input.nowMs < input.endsAtMs
  );
}
