'use client';

import React, { useRef, useState } from 'react';
import {
  formatVnd,
  DEFAULT_BOOKING_TIMEZONE,
  assertBookableWindow,
  localInputToIso,
} from '../../booking/model/booking-time';
import { BookingDateTimeInput } from '../../booking/components/booking-schedule-picker';
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
import { GuestOtpDialog } from './guest-otp-dialog';
import {
  getPendingBooking,
  savePendingBooking,
} from '../../booking/components/pending-booking-alert';
import {
  resolvePendingGuestAccessToken,
  saveGuestManageToken,
} from '../api/guest-manage-token';
export {
  GuestBookingModal,
  type GuestBookingModalProps,
} from './guest-booking-modal';

export interface GuestHoldCreated {
  bookingId: string;
  bookingCode: string;
  holdExpiresAt: string;
  totalAmount: number;
  prepaymentAmount: number;
  accessToken: string;
  accessTokenExpiresAt: string;
  serverNow: string;
}

const TOKEN_STORAGE_KEY = 'guest-manage-token';

/**
 * FE-PAY-04 — Form guest giữ sân và đặt cọc 30% kèm xác thực OTP Email.
 */
export function GuestBookingForm({
  courtId,
  courtName,
  timezone = DEFAULT_BOOKING_TIMEZONE,
  onCreated,
}: {
  courtId: string;
  courtName?: string;
  timezone?: string;
  onCreated: (result: GuestHoldCreated) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GuestHoldCreated | null>(null);

  // OTP Dialog state
  const [otpModalOpen, setOtpModalOpen] = useState(false);

  // Identity của lượt checkout hiện tại; giữ nguyên qua resend/verify lại OTP.
  const checkoutIdentityRef = useRef<GuestCheckoutIdentity | null>(null);

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
      setError('Vui lòng chọn đầy đủ thời gian bắt đầu và kết thúc.');
      return false;
    }
    if (!termsAccepted) {
      setError(
        'Vui lòng đọc và xác nhận đồng ý với Điều khoản dịch vụ và Chính sách hủy & hoàn tiền.',
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

  async function handleFormSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      // Bước 1: Gửi mã OTP xác thực qua email trước khi tạo đơn
      await sendGuestBookingOtp(email.trim());
      // Sinh và lưu identity trước khi xác thực để lượt này có thể resume.
      ensureCheckoutIdentity();
      setOtpModalOpen(true);
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

  async function handleVerifyOtp(code: string) {
    // Bước 2: Xác thực mã OTP
    const verification = await verifyGuestBookingOtp(email.trim(), code);
    const identity = ensureCheckoutIdentity();

    // Bước 3: Đã xác thực thành công -> Tiến hành tạo đơn giữ chỗ khách vãng lai
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

    // Lưu vào pending booking state để phục hồi khi rớt mạng / F5
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

    setCreated(result);
    setOtpModalOpen(false);
    onCreated(result);
  }

  async function handleResendOtp() {
    await sendGuestBookingOtp(email.trim());
  }

  return (
    <section
      className="guest-booking-card"
      aria-label="Đặt sân cho khách vãng lai"
    >
      <div className="guest-card-header">
        <div className="guest-card-badge-row">
          <span className="guest-card-badge">Khách chưa có tài khoản</span>
          <span className="guest-card-security-note">
            {' '}
            Bảo mật OTP qua Email
          </span>
        </div>
        <h2 className="guest-card-title">Đặt sân (khách chưa có tài khoản)</h2>
        <p className="guest-card-subtitle">
          Dành cho khách chưa có tài khoản. Hệ thống yêu cầu xác minh email qua
          mã OTP trước khi giữ chỗ và thanh toán.
        </p>
      </div>

      <form onSubmit={handleFormSubmit} className="guest-form">
        <div className="guest-form-grid">
          <div className="guest-input-group">
            <label htmlFor="customerName">
              <span className="label-icon"></span> Họ và tên
            </label>
            <input
              id="customerName"
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
            <label htmlFor="customerPhone">
              <span className="label-icon"></span> Số điện thoại
            </label>
            <input
              id="customerPhone"
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

          <div className="guest-input-group">
            <label htmlFor="customerEmail">
              <span className="label-icon"></span> Địa chỉ Email
            </label>
            <input
              id="customerEmail"
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
              Dùng để nhận OTP xác minh và mã QR
            </small>
          </div>
        </div>

        <div className="guest-datetime-wrapper">
          <BookingDateTimeInput
            label="Bắt đầu"
            timezone={timezone}
            value={startsAt}
            onChange={setStartsAt}
            disabled={submitting}
          />
          <BookingDateTimeInput
            label="Kết thúc"
            timezone={timezone}
            value={endsAt}
            onChange={setEndsAt}
            disabled={submitting}
          />
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

        <div className="guest-submit-row">
          <button
            type="submit"
            className="guest-submit-btn"
            disabled={submitting || !termsAccepted}
            aria-label="Tiếp tục & Nhận mã OTP (cọc 30%)"
          >
            {submitting ? 'Đang gửi mã OTP…' : 'Tiếp tục & Nhận mã OTP'}
          </button>
        </div>
      </form>

      {created && (
        <div className="guest-created-banner" role="status">
          <p>
            Mã đơn <strong>{created.bookingCode}</strong> — tiền cọc 30%:{' '}
            {formatVnd(created.prepaymentAmount)} (Tổng giá thuê sân:{' '}
            {formatVnd(created.totalAmount)}).
          </p>
          <p className="guest-created-note">
            Mã truy cập đã được lưu trong phiên này. Mất mã vui lòng liên hệ
            quầy để được hỗ trợ.
          </p>
        </div>
      )}

      <GuestOtpDialog
        email={email}
        isOpen={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        onVerify={handleVerifyOtp}
        onResend={handleResendOtp}
      />
    </section>
  );
}

export function readGuestToken(bookingId: string): string | null {
  try {
    return sessionStorage.getItem(`${TOKEN_STORAGE_KEY}:${bookingId}`);
  } catch {
    return null;
  }
}
