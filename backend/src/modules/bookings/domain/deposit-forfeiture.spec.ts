import { describe, expect, it } from '@jest/globals';
import {
  isInLateCancelWindow,
  quoteDepositForfeiture,
} from './deposit-forfeiture.js';

// UNVERIFIED (backend test scope BLOCKED) — authored per plan, not executed.
describe('quoteDepositForfeiture (D16)', () => {
  it('paid30 → giữ deposit, hoàn 0, waive 70% chưa thu', () => {
    const quote = quoteDepositForfeiture({
      totalAmount: 1_000_000,
      receipts: [{ receiptId: 'r1', creditedAmount: 300_000 }],
    });
    expect(quote.depositAmount).toBe(300_000);
    expect(quote.forfeitedAmount).toBe(300_000);
    expect(quote.lines).toEqual([]);
    expect(quote.totalRefund).toBe(0);
  });

  it('paid100 một receipt → giữ 30%, hoàn 70%', () => {
    const quote = quoteDepositForfeiture({
      totalAmount: 1_000_000,
      receipts: [{ receiptId: 'r1', creditedAmount: 1_000_000 }],
    });
    expect(quote.depositAmount).toBe(300_000);
    expect(quote.forfeitedAmount).toBe(300_000);
    expect(quote.totalRefund).toBe(700_000);
  });

  it('paid100 hai receipts → FIFO, mỗi line ≤ refundable', () => {
    const quote = quoteDepositForfeiture({
      totalAmount: 1_000_000,
      receipts: [
        { receiptId: 'r1', creditedAmount: 300_000 },
        { receiptId: 'r2', creditedAmount: 700_000 },
      ],
    });
    expect(quote.lines).toEqual([
      { receiptId: 'r1', refundAmount: 300_000 },
      { receiptId: 'r2', refundAmount: 400_000 },
    ]);
    expect(quote.totalRefund).toBe(700_000);
  });

  it('trừ reserve/completed trước khi tính pool; không hoàn vượt tiền nhận', () => {
    const quote = quoteDepositForfeiture({
      totalAmount: 1_000_000,
      receipts: [{ receiptId: 'r1', creditedAmount: 1_000_000 }],
      reservedByReceipt: { r1: 100_000 },
      completedByReceipt: { r1: 200_000 },
    });
    // pool = 700k → hoàn 400k, giữ 300k.
    expect(quote.totalRefund).toBe(400_000);
    expect(quote.forfeitedAmount).toBe(300_000);
  });

  it('paid ít hơn deposit → giữ toàn bộ, hoàn 0', () => {
    const quote = quoteDepositForfeiture({
      totalAmount: 1_000_000,
      receipts: [{ receiptId: 'r1', creditedAmount: 100_000 }],
    });
    expect(quote.totalRefund).toBe(0);
    expect(quote.forfeitedAmount).toBe(100_000);
  });

  it('làm tròn HALF_UP (tổng lẻ)', () => {
    const quote = quoteDepositForfeiture({
      totalAmount: 1_000_001,
      receipts: [{ receiptId: 'r1', creditedAmount: 1_000_001 }],
    });
    // 30% của 1.000.001 = 300.000,3 → 300.000.
    expect(quote.depositAmount).toBe(300_000);
    expect(quote.totalRefund).toBe(700_001);
  });
});

describe('isInLateCancelWindow', () => {
  const startsAt = Date.UTC(2035, 0, 8, 1, 0, 0);
  const endsAt = Date.UTC(2035, 0, 8, 2, 0, 0);
  it('đúng biên 12h và trong slot', () => {
    expect(
      isInLateCancelWindow({
        nowMs: startsAt - 12 * 3_600_000,
        startsAtMs: startsAt,
        endsAtMs: endsAt,
      }),
    ).toBe(true);
    expect(
      isInLateCancelWindow({
        nowMs: endsAt - 1,
        startsAtMs: startsAt,
        endsAtMs: endsAt,
      }),
    ).toBe(true);
  });

  it('ngoài cửa sổ: trước 12h và từ endsAt', () => {
    expect(
      isInLateCancelWindow({
        nowMs: startsAt - 12 * 3_600_000 - 1,
        startsAtMs: startsAt,
        endsAtMs: endsAt,
      }),
    ).toBe(false);
    expect(
      isInLateCancelWindow({
        nowMs: endsAt,
        startsAtMs: startsAt,
        endsAtMs: endsAt,
      }),
    ).toBe(false);
  });
});
