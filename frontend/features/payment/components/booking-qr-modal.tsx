'use client';

import React, { useEffect, useRef, useState } from 'react';
import { DemoSimulateSection, PaymentQr } from './payment-status-panel';
import { PAYMENT_SIMULATION_ENABLED } from '../../../constants/features';
import { formatVnd, formatBookingDate } from '../../booking/model/booking-time';
import {
  usePaymentCountdown,
  formatCountdown,
} from '../hooks/use-payment-countdown';
import { useBookingCheckout } from '../hooks/use-payment-status';

function focusableQrElements(root: HTMLElement): HTMLElement[] {
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(root.querySelectorAll<HTMLElement>(selectors)).filter(
    (el) => {
      if (el.getAttribute('aria-hidden') === 'true') return false;
      const style = el.style;
      if (style && (style.display === 'none' || style.visibility === 'hidden'))
        return false;
      if (el.offsetParent !== null || el === document.activeElement)
        return true;
      // JSDOM / môi trường test không tính CSS layout nên offsetParent luôn là null.
      if (typeof window !== 'undefined' && el.offsetParent === null) {
        return true;
      }
      return false;
    },
  );
}

export interface BookingQrModalProps {
  isOpen: boolean;
  bookingId: string;
  bookingCode: string;
  courtName?: string;
  courtCode?: string;
  startsAt?: string;
  endsAt?: string;
  totalAmount?: number;
  prepaymentAmount: number;
  holdExpiresAt?: string;
  vietQrPayload?: string;
  checkoutUrl?: string;
  onCancel?: () => Promise<void> | void;
  onClose?: () => void;
  /**
   * STEP4-P1-2: mở lại từ cảnh báo pending/link khôi phục → chỉ đọc recovery
   * (GET), không POST tạo payment khi mount. Tạo mới chỉ khi user bấm nút
   * retry mà recovery cho phép (chưa có provider link).
   */
  resumeOnly?: boolean;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function BookingQrModal({
  isOpen,
  bookingId,
  bookingCode,
  courtName,
  courtCode,
  startsAt,
  endsAt,
  totalAmount,
  prepaymentAmount,
  holdExpiresAt,
  vietQrPayload,
  checkoutUrl,
  onCancel,
  onClose,
  resumeOnly = false,
  triggerRef,
}: BookingQrModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [copied, setCopied] = useState(false);

  // Hook checkout: resume từ pending chỉ đọc recovery (GET), không POST khi mount.
  const checkout = useBookingCheckout(isOpen ? bookingId : '', { resumeOnly });

  const effectiveExpiresAt =
    checkout.request?.expiresAt ?? holdExpiresAt ?? null;
  const countdown = usePaymentCountdown({
    expiresAt: effectiveExpiresAt,
    serverNow: checkout.outcome?.serverNow ?? null,
    onExpired: () => {
      // FINAL-03: hết thời gian hiển thị dừng poll tự động, vẫn thực hiện
      // đúng một lượt GET xác minh trạng thái từ máy chủ.
      checkout.pausePolling();
      checkout.refreshRead();
    },
  });

  useEffect(() => {
    if (countdown.expired) {
      checkout.pausePolling();
    }
  }, [countdown.expired, checkout.pausePolling]);

  // FINAL-02 + REM-02 (AC-24): đặt tiêu điểm ban đầu vào trong hộp thoại khi mở,
  // hỗ trợ phím ESC đóng an toàn và bẫy tiêu điểm Tab/Shift+Tab cả hai chiều
  // ngay cả khi BookingQrModal được mở trực tiếp từ cảnh báo pending / link khôi phục.
  useEffect(() => {
    if (!isOpen) return;
    const modal = modalRef.current;
    if (
      modal &&
      (!document.activeElement || !modal.contains(document.activeElement))
    ) {
      const initial = focusableQrElements(modal)[0];
      initial?.focus();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!onClose || cancelling) return;
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !modal) return;
      const items = focusableQrElements(modal);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const outside = !active || !modal.contains(active);
      if (event.shiftKey && (active === first || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || outside)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen, onClose, cancelling]);

  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      triggerRef?.current?.focus?.();
    }
    wasOpen.current = isOpen;
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  async function handleCancelClick() {
    if (!confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    if (onCancel) {
      setCancelling(true);
      try {
        setCancelError('');
        await onCancel();
        // FINAL-01 (R2): máy chủ đã xác nhận hủy thành công → chuyển ngay
        // sang trạng thái kết thúc, ẩn QR/link và khóa thao tác ngay cả khi
        // hộp thoại vẫn đang mở.
        checkout.markCancelled();
      } catch (error) {
        setCancelError(
          error instanceof Error
            ? error.message
            : 'Chưa hủy được đơn. Vui lòng thử lại.',
        );
      } finally {
        setCancelling(false);
        setConfirmCancel(false);
      }
    }
  }

  function handleCopyBookingCode() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(bookingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // Chỉ render payload do provider/backend xác nhận. Không tự ghép chuỗi QR:
  // thiếu payload ⇒ loading (CREATING) hoặc lỗi có nút thử lại.
  const activeVietQr = checkout.request?.vietQrPayload || vietQrPayload || null;
  const activeCheckoutUrl = checkout.request?.checkoutUrl || checkoutUrl;
  const isPaid = checkout.success;
  const paymentStatus = checkout.request?.status;
  // F4 server-authoritative: booking terminal/review khóa QR + link + retry,
  // bất kể payload/link từng hợp lệ.
  const isTerminal = checkout.terminal;
  const needsReview = checkout.reviewRequired;
  const paymentEnded = checkout.paymentTerminal;
  // RECHECK-01: resume chưa có payment nhưng server cho tạo thì hiện nút tạo
  // QR chủ động TRƯỚC nhánh loading tổng quát (kẻo loading che mất thao tác).
  // isCreating bỏ qua trường hợp resume đang chờ user bấm tạo.
  const canResumeCreate = checkout.resumeCanCreate === true;
  const isCreating =
    !isPaid &&
    !isTerminal &&
    !needsReview &&
    !paymentEnded &&
    !countdown.expired &&
    !checkout.error &&
    !activeVietQr &&
    !canResumeCreate &&
    (checkout.loading || !checkout.request || paymentStatus === 'CREATING');
  const isFailed =
    !isPaid &&
    !isTerminal &&
    !needsReview &&
    !paymentEnded &&
    !countdown.expired &&
    !isCreating &&
    (paymentStatus === 'FAILED' || Boolean(checkout.error));

  return (
    <div
      ref={modalRef}
      className="arena-modal-backdrop arena-qr-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-modal-title"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="arena-modal-card arena-qr-card">
        {/* Header với trạng thái & nút đóng */}
        <div className="arena-qr-header">
          <div className="arena-qr-badge-row">
            <div
              className={`arena-qr-badge ${isPaid ? 'is-success' : 'is-holding'}`}
            >
              <span className="live-dot" />
              {isPaid
                ? 'Thanh toán thành công'
                : isTerminal || paymentEnded
                  ? 'Đơn đã kết thúc'
                  : 'Giữ chỗ tạm thời · Cọc 30%'}
            </div>
            {onClose && (
              <button
                type="button"
                className="arena-modal-close-btn"
                onClick={onClose}
                disabled={cancelling}
                aria-label="Đóng popup"
              >
                ✕
              </button>
            )}
          </div>
          <h2 id="qr-modal-title">
            {isPaid
              ? 'Đã nhận thanh toán!'
              : isTerminal || paymentEnded
                ? 'Đơn đã kết thúc'
                : needsReview
                  ? 'Đang kiểm tra thanh toán'
                  : PAYMENT_SIMULATION_ENABLED
                    ? 'Thanh toán thử nghiệm'
                    : 'Quét mã QR thanh toán'}
          </h2>
          <p className="arena-qr-subtitle">
            {PAYMENT_SIMULATION_ENABLED
              ? 'Chế độ Demo — Không chuyển tiền thật'
              : 'Cổng PayOS / VietQR Napas247 tự động khớp lệnh'}
          </p>
        </div>

        {/* Nội dung chính chia 2 cột hiện đại */}
        <div className="arena-qr-body">
          {/* Cột trái: QR Code & Bộ đếm giờ */}
          <div className="arena-qr-canvas-box">
            {isPaid ? (
              <div className="arena-qr-state-box is-success">
                <span className="state-icon">✅</span>
                <strong>Đã thanh toán cọc 30%</strong>
                <p>
                  Lịch đặt sân của bạn đã được xác nhận chính thức trên hệ
                  thống.
                </p>
              </div>
            ) : isTerminal ? (
              <div className="arena-qr-state-box is-expired" role="status">
                <span className="state-icon">🔒</span>
                <strong>Đơn đã kết thúc</strong>
                <p>
                  Booking không còn hiệu lực thanh toán. Vui lòng chọn khung giờ
                  khác hoặc liên hệ hỗ trợ nếu bạn đã chuyển tiền.
                </p>
              </div>
            ) : needsReview ? (
              <div className="arena-qr-state-box is-loading" role="status">
                <span className="state-icon">🕵️</span>
                <strong>Đang kiểm tra thanh toán</strong>
                <p>
                  Đơn đang chờ bộ phận tài chính xác minh, chưa thanh toán thêm.
                </p>
              </div>
            ) : countdown.expired ? (
              <div className="arena-qr-state-box is-expired">
                <span className="state-icon">⏰</span>
                <strong>Hết thời gian hiển thị mã</strong>
                {/* R1 (S4-P1-1): đồng hồ client về 0 chưa chứng minh slot đã giải
                    phóng hay đơn đã hết hạn — chỉ ẩn QR/link, cho đọc lại bằng
                    GET, không tự gán trạng thái tài chính. */}
                <p>Đang kiểm tra lại trạng thái đơn từ máy chủ…</p>
                <button
                  type="button"
                  className="arena-btn-primary"
                  onClick={checkout.refreshRead}
                >
                  Tải lại trạng thái
                </button>
              </div>
            ) : canResumeCreate ? (
              <div className="arena-qr-state-box is-loading" role="status">
                <span className="state-icon">🧾</span>
                <strong>Chưa có mã thanh toán</strong>
                <p>
                  Máy chủ cho phép tạo mã QR cho đơn này. Bấm nút dưới đây để
                  tạo mã (thao tác chủ động, chỉ gửi một yêu cầu).
                </p>
                <button
                  type="button"
                  className="arena-btn-primary"
                  onClick={checkout.refresh}
                  disabled={checkout.loading}
                >
                  Tạo mã QR thanh toán
                </button>
              </div>
            ) : isCreating ? (
              <div className="arena-qr-state-box is-loading" role="status">
                <div className="qr-spinner" />
                <span>
                  Đang khởi tạo mã thanh toán từ ngân hàng, vui lòng đợi…
                </span>
              </div>
            ) : paymentEnded ? (
              <div className="arena-qr-state-box is-expired" role="status">
                <span className="state-icon">⛔</span>
                <strong>Yêu cầu thanh toán đã kết thúc</strong>
                <p>
                  Mã thanh toán này không còn hiệu lực. Vui lòng tạo booking mới
                  nếu bạn vẫn muốn giữ sân.
                </p>
              </div>
            ) : isFailed ? (
              <div className="arena-qr-state-box is-expired" role="alert">
                <span className="state-icon">⚠️</span>
                <strong>Chưa tạo được mã thanh toán</strong>
                <p>
                  {checkout.error ||
                    'Cổng thanh toán chưa sẵn sàng. Vui lòng thử lại.'}
                </p>
                <button
                  type="button"
                  className="arena-btn-primary"
                  onClick={checkout.refresh}
                  disabled={checkout.loading}
                >
                  Thử tạo lại mã QR
                </button>
              </div>
            ) : activeVietQr ? (
              <>
                <div className="qr-image-wrapper">
                  <PaymentQr payload={activeVietQr} />
                </div>
                <div className="arena-qr-timer">
                  <span className="timer-label">Hết hạn giữ chỗ sau:</span>
                  <strong className="timer-digits" role="timer">
                    {formatCountdown(countdown.remainingMs)}
                  </strong>
                </div>
              </>
            ) : (
              <div className="arena-qr-state-box is-loading" role="status">
                <div className="qr-spinner" />
                <span>Đang chờ mã QR từ ngân hàng…</span>
              </div>
            )}
          </div>

          {/* Cột phải: Chi tiết đơn & Thông tin thanh toán */}
          <div className="arena-qr-details">
            <DemoSimulateSection
              requestId={checkout.request?.id ?? null}
              orderCode={checkout.request?.providerOrderCode}
              bookingId={bookingId}
              visible={checkout.canPay && !countdown.expired && !cancelling}
              onSimulated={checkout.refreshRead}
            />
            <div className="arena-qr-info-group">
              <div className="arena-qr-row">
                <span className="label">Sân thi đấu</span>
                <strong className="val">
                  {courtName || courtCode || 'SMASH ARENA'}
                </strong>
              </div>

              {startsAt && (
                <div className="arena-qr-row">
                  <span className="label">Khung giờ</span>
                  <strong className="val">
                    {startsAt.slice(11, 16)} –{' '}
                    {endsAt ? endsAt.slice(11, 16) : '—'} (
                    {formatBookingDate(startsAt)})
                  </strong>
                </div>
              )}

              <div className="arena-qr-row highlight-row">
                <div className="amount-col">
                  <span className="label">Tiền cọc cần chuyển (30%)</span>
                  {totalAmount !== undefined && (
                    <span className="sub-label">
                      Tổng tiền: {formatVnd(totalAmount)} · Còn 70% thanh toán
                      tại quầy
                    </span>
                  )}
                </div>
                <strong className="amount-val">
                  {formatVnd(prepaymentAmount)}
                </strong>
              </div>

              <div className="arena-qr-row transfer-content-row">
                <div className="transfer-header">
                  <span className="label">
                    Nội dung chuyển khoản (Bắt buộc)
                  </span>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={handleCopyBookingCode}
                    title="Sao chép mã đơn"
                  >
                    {copied ? '✓ Đã sao chép' : 'Sao chép'}
                  </button>
                </div>
                <div className="code-box">
                  <code>{bookingCode}</code>
                </div>
              </div>
            </div>

            {!PAYMENT_SIMULATION_ENABLED && (
              <div className="arena-qr-instructions">
                <span className="icon">💡</span>
                <p>
                  Mở ứng dụng Ngân hàng hoặc Ví điện tử bất kỳ, chọn{' '}
                  <strong>Quét mã QR</strong>. Hệ thống xác nhận tự động sau{' '}
                  <strong>10–30 giây</strong>.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Thanh tác vụ chân trang */}
        <div className="arena-qr-actions">
          {activeCheckoutUrl &&
            activeVietQr &&
            !isFailed &&
            !isPaid &&
            !isTerminal &&
            !needsReview &&
            !paymentEnded &&
            !countdown.expired && (
              <a
                href={activeCheckoutUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="arena-btn-primary btn-payos"
              >
                Mở link thanh toán PayOS trực tiếp ↗
              </a>
            )}

          {!isPaid &&
            !countdown.expired &&
            !isTerminal &&
            !needsReview &&
            !paymentEnded &&
            // RECHECK-03: ở chế độ resume, khóa nút hủy theo quyền server
            // (allowedActions.canCancelHold); luồng thường giữ nguyên.
            (checkout.recovery == null ||
              checkout.recovery.allowedActions.canCancelHold) && (
              <div className="arena-qr-cancel-row">
                {cancelError && <p role="alert">{cancelError}</p>}
                {confirmCancel ? (
                  <div className="arena-qr-confirm-cancel">
                    <span>
                      Bạn chắc chắn muốn hủy đơn này để giải phóng sân?
                    </span>
                    <div className="confirm-btns">
                      <button
                        type="button"
                        className="btn-danger-confirm"
                        onClick={handleCancelClick}
                        disabled={cancelling}
                      >
                        {cancelling ? 'Đang hủy…' : 'Xác nhận hủy đơn'}
                      </button>
                      <button
                        type="button"
                        className="btn-cancel-back"
                        onClick={() => setConfirmCancel(false)}
                        disabled={cancelling}
                      >
                        Quay lại
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="arena-qr-cancel-trigger"
                    onClick={handleCancelClick}
                  >
                    Hủy đơn đặt sân này
                  </button>
                )}
              </div>
            )}

          {(isPaid ||
            countdown.expired ||
            isTerminal ||
            needsReview ||
            paymentEnded) &&
            onClose && (
              <button
                type="button"
                className="arena-btn-primary btn-full"
                onClick={onClose}
              >
                {isPaid ? 'Hoàn tất & Xem đơn' : 'Đóng'}
              </button>
            )}
        </div>
      </div>
    </div>
  );
}
