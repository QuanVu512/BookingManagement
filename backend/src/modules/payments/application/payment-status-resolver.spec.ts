import {
  resolvePaymentOutcome,
  type OutcomeFacts,
} from './payment-status-resolver.js';

const base: OutcomeFacts = {
  bookingStatus: 'HOLDING',
  requiredPrepaymentAmount: 45_000,
  netCredited: 0,
  hasRefundRequiredReceipt: false,
  hasUnknownOrFailedRefundAttempt: false,
  hasFailedRefund: false,
  needsRefundDestination: false,
};

describe('resolvePaymentOutcome (MIG-14)', () => {
  it('CONFIRMED + đủ tiền verified → SCR04 success', () => {
    expect(
      resolvePaymentOutcome({ ...base, bookingStatus: 'CONFIRMED', netCredited: 45_000 }),
    ).toMatchObject({ screen: 'SCR04_SUCCESS', reviewRequired: false });
  });

  it('PAID + HOLDING không phải success → pending', () => {
    expect(
      resolvePaymentOutcome({ ...base, netCredited: 45_000 }),
    ).toMatchObject({ screen: 'SCR_PENDING' });
  });

  it('request EXPIRED + late REFUND_REQUIRED → SCR06 review', () => {
    expect(
      resolvePaymentOutcome({
        ...base,
        bookingStatus: 'EXPIRED',
        hasRefundRequiredReceipt: true,
      }),
    ).toMatchObject({ screen: 'SCR06_REVIEW', reviewRequired: true });
  });

  it('EXPIRED không tiền cần xử lý → SCR05', () => {
    expect(resolvePaymentOutcome({ ...base, bookingStatus: 'EXPIRED' })).toMatchObject({
      screen: 'SCR05_EXPIRED',
    });
  });

  it('attempt UNKNOWN phân biệt với FAILED (MIG-16)', () => {
    expect(
      resolvePaymentOutcome({ ...base, hasUnknownOrFailedRefundAttempt: true }),
    ).toMatchObject({ reviewReasonCode: 'REFUND_UNKNOWN_REVIEW' });
    expect(
      resolvePaymentOutcome({
        ...base,
        hasUnknownOrFailedRefundAttempt: true,
        hasFailedRefund: true,
      }),
    ).toMatchObject({ reviewReasonCode: 'REFUND_FAILED_REVIEW' });
  });

  it('thiếu destination hoàn → action rõ ràng', () => {
    expect(
      resolvePaymentOutcome({ ...base, needsRefundDestination: true }),
    ).toMatchObject({ reviewReasonCode: 'REFUND_DESTINATION_NEEDED' });
  });
});
