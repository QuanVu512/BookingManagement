/**
 * C08 — Chính sách báo phí hủy có thu (domain thuần, không Nest/Prisma).
 * - Phí 10% tính MỘT lần trên tổng booking (aggregate), half-up integer.
 * - Pool hoàn = max(sum(refundable từng receipt) − phí, 0), phân bổ FIFO,
 *   mỗi line không vượt refundable của chính receipt đó.
 * - refundable(receipt) = max(credited − reserved − completed, 0).
 */
export interface CancellationReceiptInput {
  receiptId: string;
  creditedAmount: number;
}

export interface CancellationQuoteLine {
  receiptId: string;
  refundAmount: number;
}

export interface CancellationQuote {
  penaltyAmount: number;
  lines: CancellationQuoteLine[];
  totalRefund: number;
}

function assertVndInteger(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} phải là số nguyên VND không âm.`);
  }
  return value;
}

export function quoteAggregateCancellation(input: {
  totalAmount: number;
  penaltyPercent?: number;
  receipts: CancellationReceiptInput[];
  reservedByReceipt?: Record<string, number>;
  completedByReceipt?: Record<string, number>;
}): CancellationQuote {
  const total = assertVndInteger(input.totalAmount, 'totalAmount');
  const percent = input.penaltyPercent ?? 10;
  if (!Number.isSafeInteger(percent) || percent < 0 || percent > 100) {
    throw new Error('penaltyPercent phải trong 0..100.');
  }
  // Half-up integer: floor((total * percent + 50) / 100).
  const penaltyAmount = Math.floor((total * percent + 50) / 100);
  const reserved = input.reservedByReceipt ?? {};
  const completed = input.completedByReceipt ?? {};
  const refundables = input.receipts.map((receipt) => {
    const credited = assertVndInteger(receipt.creditedAmount, 'creditedAmount');
    const held =
      assertVndInteger(reserved[receipt.receiptId] ?? 0, 'reservedAmount') +
      assertVndInteger(completed[receipt.receiptId] ?? 0, 'completedAmount');
    return { receiptId: receipt.receiptId, refundable: Math.max(credited - held, 0) };
  });
  let pool = refundables.reduce((sum, row) => sum + row.refundable, 0);
  pool = Math.max(pool - penaltyAmount, 0);
  const lines: CancellationQuoteLine[] = [];
  for (const row of refundables) {
    if (pool <= 0) break;
    const share = Math.min(row.refundable, pool);
    if (share <= 0) continue;
    lines.push({ receiptId: row.receiptId, refundAmount: share });
    pool -= share;
  }
  return {
    penaltyAmount,
    lines,
    totalRefund: lines.reduce((sum, line) => sum + line.refundAmount, 0),
  };
}
