'use client';
import { formatVnd } from '../../booking/model/booking-time';
import { isPaymentSuccess } from '../api/payment-contract';
import type { PaymentOutcome, PaymentRequestRecord } from '../model/payment';
import {
  formatCountdown,
  usePaymentCountdown,
} from '../hooks/use-payment-countdown';

/**
 * FE-PAY-05/06/07 — Panel trạng thái thanh toán, MỘT resolver UI (MIG-14).
 * - Success chỉ khi server outcome SCR04 + booking CONFIRMED.
 * - Copy trung thực theo evidence (MIG-17): không "chưa trừ tiền", không
 *   "đảm bảo hoàn 100%", không mã hỗ trợ giả, không QR check-in.
 * - Countdown hết giờ chỉ refresh authoritative, không tự EXPIRED.
 */
const REVIEW_COPY: Record<string, string> = {
  LATE_PAYMENT_REVIEW:
    'Hệ thống ghi nhận một khoản tiền cần tra soát. Nếu bạn đã chuyển khoản, khoản tiền sẽ được đối soát và hoàn theo quy định.',
  OVERPAYMENT_REVIEW:
    'Số tiền ghi nhận vượt nghĩa vụ của đơn. Khoản vượt sẽ được đưa vào đối soát hoàn tiền.',
  AMOUNT_MISMATCH_REVIEW:
    'Số tiền ghi nhận chưa khớp yêu cầu. Hệ thống đã chuyển khoản này sang đối soát.',
  REFUND_UNKNOWN_REVIEW:
    'Yêu cầu hoàn tiền đang được kiểm tra trạng thái. Vui lòng không chuyển tiền lại.',
  REFUND_FAILED_REVIEW:
    'Lệnh hoàn tiền chưa thành công và cần xử lý tiếp. Hệ thống đã ghi nhận để đối soát.',
  REFUND_DESTINATION_NEEDED:
    'Cần bổ sung thông tin tài khoản nhận hoàn để tiếp tục xử lý.',
};

export function PaymentStatusPanel({
  request,
  outcome,
  serverNow,
  supportPhone,
  onRefresh,
  onRetry,
}: {
  request: PaymentRequestRecord;
  outcome: PaymentOutcome | null;
  serverNow: string | null;
  supportPhone: string | null;
  onRefresh: () => void;
  onRetry: () => void;
}) {
  const countdown = usePaymentCountdown({
    expiresAt: request.expiresAt,
    serverNow,
    onExpired: onRefresh,
  });
  const success = outcome !== null && isPaymentSuccess(outcome);

  return (
    <section aria-label="Trạng thái thanh toán">
      <h2>
        {success
          ? 'Đặt sân thành công'
          : outcome?.screen === 'SCR06_REVIEW'
            ? 'Khoản thanh toán cần tra soát'
            : outcome?.screen === 'SCR05_EXPIRED'
              ? 'Giữ chỗ đã hết hạn'
              : outcome?.screen === 'SCR_CANCELLED'
                ? 'Đơn đã hủy'
                : 'Đang chờ thanh toán'}
      </h2>
      <dl>
        <div>
          <dt>Mã thanh toán</dt>
          <dd>{request.paymentCode}</dd>
        </div>
        <div>
          <dt>Số tiền</dt>
          <dd>{formatVnd(request.amount)}</dd>
        </div>
        <div>
          <dt>Trạng thái</dt>
          <dd>{request.status}</dd>
        </div>
      </dl>

      {!success && request.expiresAt && !countdown.expired && (
        <p role="timer" aria-live="off">
          Còn lại {formatCountdown(countdown.remainingMs)} để hoàn tất thanh
          toán.
        </p>
      )}
      {!success && countdown.expired && (
        <p role="status">
          Khung giờ giữ chỗ đã hết hạn trên hệ thống. Nếu bạn đã chuyển khoản,
          hệ thống sẽ tự động tra soát và hoàn tiền.
        </p>
      )}

      {outcome?.reviewRequired && (
        <p role="alert">
          {REVIEW_COPY[outcome.reviewReasonCode ?? ''] ??
            'Khoản thanh toán cần được tra soát thêm.'}
        </p>
      )}

      {request.checkoutUrl && !success && (
        <p>
          <a href={request.checkoutUrl}>Mở trang thanh toán payOS</a>
        </p>
      )}

      <p>
        <button type="button" onClick={onRefresh}>
          Tải lại trạng thái
        </button>{' '}
        <button type="button" onClick={onRetry}>
          Thử lại
        </button>
      </p>

      {supportPhone ? (
        <p>
          Cần hỗ trợ? Gọi <a href={`tel:${supportPhone}`}>{supportPhone}</a> và
          cung cấp mã {request.paymentCode}.
        </p>
      ) : null}
    </section>
  );
}
