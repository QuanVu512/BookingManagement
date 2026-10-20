import {
  FULL_PAYMENT_PERCENT,
  MAX_VND_AMOUNT,
  PREPAYMENT_PERCENT,
} from '../payment.constants.js';

/**
 * BE-PAY-01 — Toán tiền VND nguyên (MIG-02, MIG-03, MIG-19).
 * Mọi amount là integer >= 0; làm tròn 30% half-up về đồng.
 * Không dùng float ở bất kỳ phép tính nghiệp vụ nào.
 */
export interface MoneySummary {
  total: number;
  credited: number;
  refundedCompleted: number;
  netCredited: number;
  balanceDue: number;
}

export function assertVndAmount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`${field} phải là số nguyên VND.`);
  }
  if (value < 0 || value > MAX_VND_AMOUNT) {
    throw new Error(`${field} ngoài biên cho phép.`);
  }
  return value;
}

/** 30% cọc / 100% toàn phần trên tổng booking đã snapshot. */
export function prepaymentAmountFor(
  totalAmount: number,
  percent: 30 | 100,
): number {
  assertVndAmount(totalAmount, 'totalAmount');
  if (percent === FULL_PAYMENT_PERCENT) return totalAmount;
  // Half-up: (total * 30 + 50) / 100 dùng integer math.
  return Math.floor((totalAmount * PREPAYMENT_PERCENT + 50) / 100);
}

/**
 * MIG-02: H = receipt VERIFIED + ALLOCATED đúng booking; C = sum(H);
 * F = sum refund COMPLETED trên chính H; N = C − F (không âm);
 * balanceDue = max(total − N, 0), kể cả booking CONFIRMED còn nghĩa vụ.
 */
export function summarizeBookingMoney(input: {
  totalAmount: number;
  allocatedReceiptAmounts: number[];
  completedRefundAmounts: number[];
}): MoneySummary {
  const total = assertVndAmount(input.totalAmount, 'totalAmount');
  let credited = 0;
  for (const amount of input.allocatedReceiptAmounts) {
    credited += assertVndAmount(amount, 'receiptAmount');
  }
  let refundedCompleted = 0;
  for (const amount of input.completedRefundAmounts) {
    refundedCompleted += assertVndAmount(amount, 'refundAmount');
  }
  if (refundedCompleted > credited) {
    throw new Error('Tiền hoàn đã xong không được vượt tiền đã credit.');
  }
  const netCredited = credited - refundedCompleted;
  return {
    total,
    credited,
    refundedCompleted,
    netCredited,
    balanceDue: Math.max(total - netCredited, 0),
  };
}

/**
 * MIG-03: whole-receipt all-or-nothing. Receipt đã verify chỉ được
 * auto-allocate toàn bộ khi không vượt nghĩa vụ còn lại (>0) và request
 * phù hợp; ngược lại giữ nguyên amount thực nhận và đưa toàn receipt
 * sang REFUND_REQUIRED/đối soát — không cắt receipt.
 */
export function canAllocateWholeReceipt(
  receiptAmount: number,
  remainingObligation: number,
): boolean {
  assertVndAmount(receiptAmount, 'receiptAmount');
  assertVndAmount(remainingObligation, 'remainingObligation');
  return receiptAmount > 0 && receiptAmount <= remainingObligation;
}

/**
 * Tiền hoàn customer-cancellation: deposit − penalty 10% tổng giá,
 * floor 0; mỗi receipt không vượt refundable của chính nó (MIG-19).
 */
export function cancellationRefundFor(input: {
  totalAmount: number;
  creditedAmount: number;
}): { penaltyAmount: number; refundAmount: number } {
  const total = assertVndAmount(input.totalAmount, 'totalAmount');
  const credited = assertVndAmount(input.creditedAmount, 'creditedAmount');
  const penaltyAmount = Math.floor((total * 10 + 50) / 100);
  return {
    penaltyAmount,
    refundAmount: Math.max(Math.min(credited, total) - penaltyAmount, 0),
  };
}
