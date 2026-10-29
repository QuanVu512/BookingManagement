'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  formatVnd,
  DEFAULT_BOOKING_TIMEZONE,
  assertBookableWindow,
  localInputToIso,
  formatBookingDate,
} from '../../booking/model/booking-time';
import {
  createGuestBooking,
  newIdempotencyKey,
  sendGuestBookingOtp,
  verifyGuestBookingOtp,
} from '../api/payment-service';
import {
  createGuestCheckoutIdentity,
  saveGuestCheckoutIdentity,
  type GuestCheckoutIdentity,
} from '../api/guest-checkout-identity';
import { TransactionTerms } from '../../legal/components/transaction-terms';
import {
  getPendingBooking,
  savePendingBooking,
} from '../../booking/components/pending-booking-alert';
import {
  resolvePendingGuestAccessToken,
  saveGuestManageToken,
} from '../api/guest-manage-token';
import type { GuestHoldCreated } from './guest-booking-form';

export interface GuestBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  courtId: string;
  courtName?: string;
  courtCode?: string;
  timezone?: string;
  preselectedWindow?: { start: string; end: string };
  totalAmount?: number;
  prepaymentAmount?: number;
  onCreated: (result: GuestHoldCreated) => void;
}

export function GuestBookingModal({
  isOpen,
  onClose,
  courtId,
  courtName,
  courtCode,
  timezone = DEFAULT_BOOKING_TIMEZONE,
  preselectedWindow,
  totalAmount,
  prepaymentAmount,
  onCreated,
}: GuestBookingModalProps) {
  // Step state: 'info' (nhập thông tin) | 'otp' (xác thực mã 6 số)
  const [step, setStep] = useState<'info' | 'otp'>('info');

  // Customer info fields
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Khung giờ đặt sân lấy trực tiếp từ lịch đã chọn ngoài trang chính (không sửa trong form)
  const startsAt = preselectedWindow?.start ?? '';
  const endsAt = preselectedWindow?.end ?? '';

  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP step state
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Identity của lượt checkout hiện tại; giữ nguyên qua resend/verify lại OTP
  // để backend replay đúng intent thay vì tạo hold thứ hai.
  const checkoutIdentityRef = useRef<GuestCheckoutIdentity | null>(null);

  // Sync state when isOpen changes
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setStep('info');
      setDigits(['', '', '', '', '', '']);
      checkoutIdentityRef.current = null;
    }
  }, [isOpen]);

  // OTP Countdown timer when on 'otp' step
  useEffect(() => {
    if (!isOpen || step !== 'otp' || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, step, resendCooldown]);

  // Auto-focus first OTP digit when switching to OTP step
  useEffect(() => {
    if (step === 'otp') {
      const timer = setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [step]);

  if (!isOpen) return null;

  // Calculate 30% prepayment if not passed
  const calculatedPrepayment =
    prepaymentAmount ??
    (totalAmount !== undefined
      ? Math.floor((totalAmount * 30 + 50) / 100)
      : undefined);
  const calculatedRemaining =
    totalAmount !== undefined && calculatedPrepayment !== undefined
      ? totalAmount - calculatedPrepayment
      : undefined;

  function validateForm(): boolean {
    setError(null);
    if (!name.trim()) {
      setError('Vui lòng nhập họ và tên của bạn.');
      return false;
    }
    if (!phone.trim() || phone.trim().length < 9) {
      setError('Vui lòng nhập số điện thoại hợp lệ (tối thiểu 9 số).');
      return false;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Vui lòng nhập địa chỉ email hợp lệ để nhận mã OTP.');
      return false;
    }
    if (!startsAt || !endsAt) {
      setError(
        'Vui lòng đóng popup và chọn khung giờ đặt sân trên lịch trước khi tiếp tục.',
      );
      return false;
    }
    if (!termsAccepted) {
      setError(
        'Vui lòng đọc và xác nhận đồng ý với Điều khoản dịch vụ và Chính sách cọc 30%.',
      );
      return false;
    }
    try {
      assertBookableWindow({ start: startsAt, end: endsAt }, timezone);
    } catch (windowErr) {
      setError(
        windowErr instanceof Error
          ? windowErr.message
          : 'Khung giờ đặt sân không hợp lệ.',
      );
      return false;
    }
    return true;
  }

  function ensureCheckoutIdentity(): GuestCheckoutIdentity {
    if (!checkoutIdentityRef.current) {
      checkoutIdentityRef.current = createGuestCheckoutIdentity();
      saveGuestCheckoutIdentity(checkoutIdentityRef.current);
    }
    return checkoutIdentityRef.current;
  }

  async function handleSendOtp(event: React.FormEvent) {
    event.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      await sendGuestBookingOtp(email.trim());
      // Sinh và lưu identity trước khi xác thực để lượt này có thể resume.
      ensureCheckoutIdentity();
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      setStep('otp');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không gửi được mã xác thực OTP qua email.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyOtpCode(codeToVerify: string) {
    if (verifying) return;
    setError(null);
    setVerifying(true);
    try {
      const verification = await verifyGuestBookingOtp(
        email.trim(),
        codeToVerify,
      );
      const identity = ensureCheckoutIdentity();

      const result = await createGuestBooking({
        courtId,
        startsAt: localInputToIso(startsAt, timezone),
        endsAt: localInputToIso(endsAt, timezone),
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim(),
        idempotencyKey: newIdempotencyKey(),
        otpProof: verification.otpProof,
        checkoutIntentId: identity.checkoutIntentId,
        recoverySecret: identity.recoverySecret,
      });

      saveGuestCheckoutIdentity({
        ...identity,
        bookingId: result.bookingId,
      });

      saveGuestManageToken(result.bookingId, result.accessToken);

      const previousPending = getPendingBooking();
      savePendingBooking({
        bookingId: result.bookingId,
        bookingCode: result.bookingCode,
        courtId,
        courtName,
        startsAt,
        endsAt,
        totalAmount: result.totalAmount,
        prepaymentAmount: result.prepaymentAmount,
        holdExpiresAt: result.holdExpiresAt,
        accessToken: resolvePendingGuestAccessToken(previousPending, result),
        type: 'guest',
      });

      onClose();
      onCreated(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Mã OTP không chính xác hoặc đã hết hạn.',
      );
    } finally {
      setVerifying(false);
    }
  }

  function handleDigitChange(index: number, val: string) {
    const char = val.slice(-1);
    if (char && !/^\d$/.test(char)) return;

    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setError(null);

    // Auto-advance to next input
    if (char && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    // Auto-submit if all 6 digits are complete
    if (char && index === 5) {
      const full = newDigits.join('');
      if (full.length === 6) {
        void handleVerifyOtpCode(full);
      }
    }
  }

  function handleDigitKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  function handleDigitPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setDigits(newDigits);
    const focusIndex = Math.min(pasted.length, 5);
    otpInputRefs.current[focusIndex]?.focus();

    if (pasted.length === 6) {
      void handleVerifyOtpCode(pasted);
    }
  }

  async function handleResendOtp() {
    if (resendCooldown > 0 || resending) return;
    setError(null);
    setResending(true);
    try {
      await sendGuestBookingOtp(email.trim());
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      otpInputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi lại OTP thất bại.');
    } finally {
      setResending(false);
    }
  }

  const isOtpComplete = digits.join('').length === 6;

  return (
    <div
      className="arena-modal-backdrop arena-guest-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-modal-title"
    >
      <div className="arena-modal-card arena-guest-modal-card">
        {/* Header */}
        <div className="arena-guest-modal-header">
          <div className="guest-modal-badge-row">
            <span className="guest-card-badge">
              {step === 'info'
                ? 'Khách chưa có tài khoản'
                : 'Bước 2/2 · Xác thực bảo mật'}
            </span>
            <button
              type="button"
              className="arena-modal-close-btn"
              onClick={onClose}
              disabled={submitting || verifying}
              aria-label="Đóng"
            >
              ✕
            </button>
          </div>
          <h2 id="guest-modal-title" className="guest-modal-title">
            {step === 'info' ? 'Thông tin người đặt sân' : 'Xác thực Email'}
          </h2>
          <p className="guest-modal-subtitle">
            {step === 'info'
              ? 'Nhập thông tin người nhận và xác thực email OTP để đặt sân'
              : `Mã OTP 6 chữ số đã được gửi tới: ${email}`}
          </p>
        </div>

        {/* STEP 1: NHẬP THÔNG TIN KHÁCH */}
        {step === 'info' && (
          <>
            {/* Court & Schedule Summary Box */}
            <div className="arena-guest-booking-preview">
              <div className="preview-court-row">
                <span className="preview-court-name">
                  🏟️ <strong>{courtName || 'Sân Pickleball'}</strong>
                  {courtCode ? ` (${courtCode})` : ''}
                </span>
              </div>

              {startsAt && endsAt ? (
                <div className="preview-schedule-chip">
                  <span className="schedule-icon">📅</span>
                  <span>
                    {formatBookingDate(startsAt)}:{' '}
                    <strong>
                      {startsAt.slice(11)} – {endsAt.slice(11)}
                    </strong>
                  </span>
                </div>
              ) : (
                <div className="preview-schedule-chip preview-schedule-empty">
                  <span className="schedule-icon">⚠️</span>
                  <span>
                    Chưa chọn khung giờ. Vui lòng đóng popup (bấm ✕) và chọn
                    khung giờ trên lịch trước khi tiếp tục.
                  </span>
                </div>
              )}

              {/* Pricing breakdown */}
              <div className="preview-price-grid">
                <div className="price-item deposit-highlight">
                  <span className="price-label">Tiền cọc bắt buộc (30%)</span>
                  <strong className="price-value">
                    {calculatedPrepayment !== undefined
                      ? formatVnd(calculatedPrepayment)
                      : '—'}
                  </strong>
                </div>
                {calculatedRemaining !== undefined && (
                  <div className="price-item">
                    <span className="price-label">
                      Thanh toán tại sân (70%)
                    </span>
                    <span className="price-sub">
                      {formatVnd(calculatedRemaining)}
                    </span>
                  </div>
                )}
                {totalAmount !== undefined && (
                  <div className="price-item">
                    <span className="price-label">Tổng tiền thuê</span>
                    <span className="price-sub">{formatVnd(totalAmount)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Form Fields */}
            <form onSubmit={handleSendOtp} className="guest-modal-form">
              <div className="guest-form-grid">
                <div className="guest-input-group">
                  <label htmlFor="modalCustomerName">
                    <span className="label-icon"></span> Họ và tên
                  </label>
                  <input
                    id="modalCustomerName"
                    name="customerName"
                    className="guest-input-field"
                    placeholder="Nguyễn Văn A"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    disabled={submitting}
                    required
                  />
                </div>

                <div className="guest-input-group">
                  <label htmlFor="modalCustomerPhone">
                    <span className="label-icon"></span> Số điện thoại
                  </label>
                  <input
                    id="modalCustomerPhone"
                    name="customerPhone"
                    type="tel"
                    className="guest-input-field"
                    placeholder="0912 345 678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoComplete="tel"
                    disabled={submitting}
                    required
                  />
                </div>

                <div
                  className="guest-input-group"
                  style={{ gridColumn: '1 / -1' }}
                >
                  <label htmlFor="modalCustomerEmail">
                    <span className="label-icon"></span> Địa chỉ Email
                  </label>
                  <input
                    id="modalCustomerEmail"
                    name="customerEmail"
                    type="email"
                    className="guest-input-field"
                    placeholder="nguyen@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={submitting}
                    required
                  />
                  <small className="field-hint">
                    Mã OTP 6 số và mã QR thanh toán sẽ được gửi tới email này
                  </small>
                </div>
              </div>

              {error && (
                <div className="guest-form-alert" role="alert">
                  <span className="alert-icon">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="guest-terms-wrapper">
                <TransactionTerms
                  accepted={termsAccepted}
                  onAcceptanceChange={setTermsAccepted}
                  disabled={submitting}
                />
              </div>

              <div className="guest-modal-actions">
                <button
                  type="button"
                  className="arena-btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="arena-btn-primary btn-submit-guest"
                  disabled={submitting || !termsAccepted}
                  aria-label="Tiếp tục và nhận mã OTP"
                >
                  {submitting ? 'Đang gửi mã OTP…' : 'Tiếp tục & Nhận mã OTP'}
                </button>
              </div>
            </form>
          </>
        )}

        {/* STEP 2: NHẬP MÃ OTP 6 CHỮ SỐ (TRONG CÙNG MODAL, KHÔNG BỊ CHỒNG LỚP) */}
        {step === 'otp' && (
          <div className="guest-modal-otp-view">
            <div className="guest-otp-notice-box">
              <span className="otp-icon-small"></span>
              <div>
                <p style={{ margin: 0, fontSize: '13px', color: '#4b4c4d' }}>
                  Vui lòng kiểm tra hộp thư (hoặc mục Spam):
                </p>
                <strong style={{ color: '#10e760', fontSize: '14px' }}>
                  {email}
                </strong>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const code = digits.join('');
                if (code.length === 6) void handleVerifyOtpCode(code);
              }}
              style={{ marginTop: '16px' }}
            >
              <div className="guest-otp-inputs" onPaste={handleDigitPaste}>
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      otpInputRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(index, e)}
                    disabled={verifying}
                    aria-label={`Số thứ ${index + 1}`}
                    className="guest-otp-digit"
                  />
                ))}
              </div>

              {error && (
                <div
                  className="guest-form-alert"
                  role="alert"
                  style={{ marginTop: '12px' }}
                >
                  <span className="alert-icon">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              <div className="guest-otp-actions" style={{ marginTop: '20px' }}>
                <button
                  type="submit"
                  className="arena-btn-primary btn-full"
                  disabled={!isOtpComplete || verifying}
                >
                  {verifying ? 'Đang xác thực…' : 'Xác nhận OTP & Đặt sân'}
                </button>

                <div className="guest-otp-resend-row">
                  {resendCooldown > 0 ? (
                    <span className="guest-otp-countdown">
                      Gửi lại mã sau <strong>{resendCooldown}s</strong>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="guest-otp-resend-btn"
                      onClick={handleResendOtp}
                      disabled={resending}
                    >
                      {resending ? 'Đang gửi lại…' : 'Gửi lại mã OTP'}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="guest-otp-cancel-btn"
                  onClick={() => {
                    setError(null);
                    setStep('info');
                  }}
                  disabled={verifying}
                >
                  ← Sửa lại email / thông tin
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
