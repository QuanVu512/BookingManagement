import type { Prisma } from '../../../generated/prisma/client.js';
import { summarizeBookingMoney } from '../../payments/domain/money.js';

/**
 * C10 — Net đã verified còn lại của booking (ALLOCATED − COMPLETED).
 * Tái dùng single source `summarizeBookingMoney`, không tính lại công thức.
 */
export async function readCheckinMoney(
  tx: Prisma.TransactionClient,
  bookingId: string,
  totalAmount: number,
): Promise<{ netCredited: number; balanceDue: number }> {
  const receipts = await tx.paymentTransaction.findMany({
    where: {
      paymentRequest: { referenceId: bookingId },
      verificationStatus: 'VERIFIED',
      allocationStatus: 'ALLOCATED',
    },
    select: { amount: true },
  });
  const completed = await tx.refundRequest.findMany({
    where: {
      paymentTransaction: { paymentRequest: { referenceId: bookingId } },
      status: 'COMPLETED',
    },
    select: { amount: true },
  });
  const summary = summarizeBookingMoney({
    totalAmount,
    allocatedReceiptAmounts: receipts.map((receipt) =>
      Number(receipt.amount.toString()),
    ),
    completedRefundAmounts: completed.map((refund) =>
      Number(refund.amount.toString()),
    ),
  });
  return { netCredited: summary.netCredited, balanceDue: summary.balanceDue };
}
