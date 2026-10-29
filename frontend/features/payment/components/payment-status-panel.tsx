'use client';
import { useEffect, useRef, useState } from 'react';
import type { BookingRecord } from '../../booking/model/booking';
import { useBookingCheckout } from '../hooks/use-payment-status';
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

export function PaymentQr({ payload }: { payload: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    setError(false);
    void import('qrcode')
      .then(async (QRCode) => {
        if (current && canvas.current)
          await QRCode.default.toCanvas(canvas.current, payload, {
            width: 240,
            margin: 4,
            errorCorrectionLevel: 'M',
          });
      })
      .catch(() => {
        if (current) setError(true);
      });
    return () => {
      current = false;
    };
  }, [payload]);
  return error ? (
    <p role="alert">Chưa hiển thị được QR. Vui lòng mở trang thanh toán.</p>
  ) : (
    <canvas ref={canvas} role="img" aria-label="Mã QR thanh toán đơn đặt sân" />
  );
}

type BookingCheckoutState = ReturnType<typeof useBookingCheckout>;
function CheckoutCode({
  checkout,
  countdown,
}: {
  checkout: BookingCheckoutState;
  countdown: { remainingMs: number; expired: boolean };
}) {
  if (!checkout.canPay) return null;
  return (
    <>
      {checkout.request?.vietQrPayload && checkout.outcome?.serverNow && (
        <p role="timer" aria-live="off">
          {formatCountdown(countdown.remainingMs)}
        </p>
      )}
      {!countdown.expired && checkout.request?.vietQrPayload && (
        <PaymentQr payload={checkout.request.vietQrPayload} />
      )}
      {!checkout.loading && !checkout.request?.vietQrPayload && (
        <p role="status">Chưa có mã QR thanh toán. Vui lòng thử lại.</p>
      )}
      {!countdown.expired && checkout.request?.checkoutUrl && (
        <a
          href={checkout.request.checkoutUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Mở trang thanh toán
        </a>
      )}
    </>
  );
}
function CheckoutMessages({ checkout }: { checkout: BookingCheckoutState }) {
  return (
    <>
      {checkout.loading && <p role="status">Đang tạo mã thanh toán…</p>}
      {checkout.error && <p role="alert">{checkout.error}</p>}
      {checkout.outcome?.reviewRequired && (
        <p role="status">Khoản thanh toán đang được kiểm tra.</p>
      )}
      {!checkout.success && (
        <button
          type="button"
          className="btn btn-secondary"
          disabled={checkout.loading}
          onClick={checkout.refresh}
        >
          Tải lại thanh toán
        </button>
      )}
    </>
  );
}
export function BookingPaymentCheckout({
  booking,
  onReset,
}: {
  booking: BookingRecord;
  onReset?: () => void;
}) {
  const checkout = useBookingCheckout(booking.id);
  const countdown = usePaymentCountdown({
    expiresAt: checkout.request?.expiresAt ?? booking.holdExpiresAt,
    serverNow: checkout.outcome?.serverNow ?? null,
    onExpired: checkout.refresh,
  });
  return (
    <section className="payment-checkout" aria-label="Thanh toán đặt sân">
      <h3>{checkout.title}</h3>
      <p>{booking.bookingCode}</p>
      <CheckoutCode checkout={checkout} countdown={countdown} />
      <CheckoutMessages checkout={checkout} />
      {checkout.terminal && onReset && (
        <button type="button" className="btn btn-primary" onClick={onReset}>
          Chọn lịch mới
        </button>
      )}
    </section>
  );
}
