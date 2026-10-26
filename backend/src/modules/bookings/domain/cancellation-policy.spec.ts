import { describe, expect, it } from '@jest/globals';
import { quoteAggregateCancellation } from './cancellation-policy.js';

describe('quoteAggregateCancellation (C08)', () => {
  it('tổng 1.000.000 đã trả 300.000 → phí 100.000, hoàn 200.000', () => {
    const quote = quoteAggregateCancellation({
      totalAmount: 1_000_000,
      receipts: [{ receiptId: 'r1', creditedAmount: 300_000 }],
    });
    expect(quote.penaltyAmount).toBe(100_000);
    expect(quote.lines).toEqual([{ receiptId: 'r1', refundAmount: 200_000 }]);
    expect(quote.totalRefund).toBe(200_000);
  });

  it('đã trả đủ 2 receipts 300.000 + 700.000 → phí một lần, hoàn 900.000 FIFO', () => {
    const quote = quoteAggregateCancellation({
      totalAmount: 1_000_000,
      receipts: [
        { receiptId: 'r1', creditedAmount: 300_000 },
        { receiptId: 'r2', creditedAmount: 700_000 },
      ],
    });
    expect(quote.penaltyAmount).toBe(100_000);
    expect(quote.lines).toEqual([
      { receiptId: 'r1', refundAmount: 300_000 },
      { receiptId: 'r2', refundAmount: 600_000 },
    ]);
    expect(quote.totalRefund).toBe(900_000);
  });

  it('trừ reserve/completed từng receipt trước khi phân bổ pool', () => {
    const quote = quoteAggregateCancellation({
      totalAmount: 1_000_000,
      receipts: [
        { receiptId: 'r1', creditedAmount: 300_000 },
        { receiptId: 'r2', creditedAmount: 700_000 },
      ],
      reservedByReceipt: { r1: 100_000 },
      completedByReceipt: { r2: 200_000 },
    });
    // refundable r1=200k, r2=500k → pool=700k−100k=600k → r1 200k, r2 400k.
    expect(quote.lines).toEqual([
      { receiptId: 'r1', refundAmount: 200_000 },
      { receiptId: 'r2', refundAmount: 400_000 },
    ]);
    expect(quote.totalRefund).toBe(600_000);
  });

  it('pool âm về 0, không hoàn khi phí vượt tiền đã trả', () => {
    const quote = quoteAggregateCancellation({
      totalAmount: 1_000_000,
      receipts: [{ receiptId: 'r1', creditedAmount: 50_000 }],
    });
    expect(quote.lines).toEqual([]);
    expect(quote.totalRefund).toBe(0);
  });
});
