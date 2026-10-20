import {
  canAllocateWholeReceipt,
  cancellationRefundFor,
  prepaymentAmountFor,
  summarizeBookingMoney,
} from './money.js';

describe('money (BE-PAY-01, MIG-02/MIG-03)', () => {
  it('fixture chốt: booking 150k → cọc 45k, còn lại 105k', () => {
    const deposit = prepaymentAmountFor(150_000, 30);
    expect(deposit).toBe(45_000);
    const summary = summarizeBookingMoney({
      totalAmount: 150_000,
      allocatedReceiptAmounts: [deposit],
      completedRefundAmounts: [],
    });
    expect(summary.balanceDue).toBe(105_000);
  });

  it('100% không còn dư nợ', () => {
    expect(prepaymentAmountFor(150_000, 100)).toBe(150_000);
    const summary = summarizeBookingMoney({
      totalAmount: 150_000,
      allocatedReceiptAmounts: [150_000],
      completedRefundAmounts: [],
    });
    expect(summary.balanceDue).toBe(0);
  });

  it('partial 20k rồi refund 20k không tạo paidAmount âm', () => {
    const summary = summarizeBookingMoney({
      totalAmount: 150_000,
      allocatedReceiptAmounts: [20_000],
      completedRefundAmounts: [20_000],
    });
    expect(summary.netCredited).toBe(0);
    expect(summary.balanceDue).toBe(150_000);
  });

  it('refund completed vượt credited bị từ chối', () => {
    expect(() =>
      summarizeBookingMoney({
        totalAmount: 150_000,
        allocatedReceiptAmounts: [20_000],
        completedRefundAmounts: [30_000],
      }),
    ).toThrow();
  });

  it('MIG-03: receipt 50k/booking nợ 150k được credit; 160k/150k bị quarantine', () => {
    expect(canAllocateWholeReceipt(50_000, 150_000)).toBe(true);
    expect(canAllocateWholeReceipt(160_000, 150_000)).toBe(false);
    expect(canAllocateWholeReceipt(20_000, 10_000)).toBe(false);
    expect(canAllocateWholeReceipt(0, 150_000)).toBe(false);
  });

  it('hủy sau cọc 45k: phạt 15k, hoàn 30k', () => {
    const quote = cancellationRefundFor({
      totalAmount: 150_000,
      creditedAmount: 45_000,
    });
    expect(quote.penaltyAmount).toBe(15_000);
    expect(quote.refundAmount).toBe(30_000);
  });

  it('từ chối float và số ngoài biên (MIG-20 safe integer)', () => {
    expect(() => prepaymentAmountFor(150_000.5, 30)).toThrow();
    expect(() => prepaymentAmountFor(Number.MAX_SAFE_INTEGER + 1, 30)).toThrow();
  });
});
