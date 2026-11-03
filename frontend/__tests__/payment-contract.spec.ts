import { describe, expect, it } from '@jest/globals';
import {
  ApiRequestError,
  isPaymentRequest,
  isPaymentSuccess,
  parsePaymentOutcome,
  parsePaymentRequest,
} from '../features/payment/api/payment-contract.js';

const request = {
  id: 'req-1',
  paymentCode: 'PAY-ABC123',
  purpose: 'PREPAYMENT',
  amount: 45000,
  currency: 'VND',
  method: 'PAYOS_TRANSFER',
  providerOrderCode: '123456',
  checkoutUrl: 'https://pay.payos.vn/web/abc',
  status: 'PENDING',
  expiresAt: '2035-01-08T00:15:00Z',
  reviewRequired: false,
  reviewReasonCode: null,
};

describe('Ranh giới dữ liệu thanh toán chuẩn (FE-PAY-02: chuẩn hóa dữ liệu thanh toán, MIG-10)', () => {
  it('FE-PAY-02 (Cấu trúc thanh toán chuẩn): chấp nhận yêu cầu thanh toán hợp lệ theo chuẩn hệ thống', () => {
    expect(isPaymentRequest(request)).toBe(true);
    expect(parsePaymentRequest(request)).toEqual(request);
  });

  it('FE-PAY-02 (Kiểm tra dữ liệu): từ chối số tiền sai định dạng chuỗi và trạng thái không xác định', () => {
    expect(isPaymentRequest({ ...request, amount: '45000' })).toBe(false);
    expect(isPaymentRequest({ ...request, status: 'SUCCESS' })).toBe(false);
    expect(() => parsePaymentRequest({ id: 'incomplete' })).toThrow(
      'Thông tin thanh toán không hợp lệ',
    );
  });

  it('MIG-14 (Xác nhận thành công): bắt buộc máy chủ trả màn hình SCR04_SUCCESS và đơn CONFIRMED', () => {
    expect(
      isPaymentSuccess(
        parsePaymentOutcome({
          screen: 'SCR04_SUCCESS',
          reviewRequired: false,
          reviewReasonCode: null,
          bookingStatus: 'CONFIRMED',
          netCredited: 45000,
          requiredPrepaymentAmount: 45000,
        }),
      ),
    ).toBe(true);
    // PAID request + HOLDING booking is NOT success.
    expect(
      isPaymentSuccess({
        screen: 'SCR_PENDING',
        reviewRequired: false,
        reviewReasonCode: null,
        bookingStatus: 'HOLDING',
        netCredited: 45000,
        requiredPrepaymentAmount: 45000,
      }),
    ).toBe(false);
    // SCR04 with review flag is NOT success.
    expect(
      isPaymentSuccess({
        screen: 'SCR04_SUCCESS',
        reviewRequired: true,
        reviewReasonCode: 'OVERPAYMENT_REVIEW',
        bookingStatus: 'CONFIRMED',
        netCredited: 160000,
        requiredPrepaymentAmount: 150000,
      }),
    ).toBe(false);
  });

  it('MIG-12 (Phân quyền và bảo mật): phân biệt rõ lỗi CSRF (được thử lại) với lỗi phân quyền RBAC (chặn thử lại)', () => {
    const csrf = new ApiRequestError({
      message: 'csrf',
      status: 403,
      errorCode: 'AUTH_CSRF',
    });
    expect(csrf.isCsrf()).toBe(true);
    const rbac = new ApiRequestError({
      message: 'forbidden',
      status: 403,
      errorCode: 'AUTH_RBAC',
    });
    expect(rbac.isCsrf()).toBe(false);
    expect(rbac.retryable).toBe(false);
  });
});
