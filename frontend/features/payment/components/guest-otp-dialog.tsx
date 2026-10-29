'use client';

import React, { useState, useEffect, useRef } from 'react';

interface GuestOtpDialogProps {
  email: string;
  isOpen: boolean;
  onClose: () => void;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<void>;
}

export function GuestOtpDialog({
  email,
  isOpen,
  onClose,
  onVerify,
  onResend,
}: GuestOtpDialogProps) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setDigits(['', '', '', '', '', '']);
    setError(null);
    setResendCooldown(60);
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, resendCooldown]);

  if (!isOpen) return null;

  function handleDigitChange(index: number, value: string) {
    const char = value.slice(-1);
    if (char && !/^\d$/.test(char)) return;

    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setError(null);

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setDigits(newDigits);
    const focusIndex = Math.min(pasted.length, 5);
    inputRefs.current[focusIndex]?.focus();
  }

  const fullCode = digits.join('');
  const isComplete = fullCode.length === 6;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!isComplete || verifying) return;
    setError(null);
    setVerifying(true);
    try {
      await onVerify(fullCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Xác thực OTP thất bại.');
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendClick() {
    if (resendCooldown > 0 || resending) return;
    setError(null);
    setResending(true);
    try {
      await onResend();
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gửi lại OTP thất bại.');
    } finally {
      setResending(false);
    }
  }

  return (
    <div
      className="arena-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-dialog-title"
    >
      <div className="arena-modal-card guest-otp-card">
        <div className="guest-otp-top-row" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <button
            type="button"
            className="arena-modal-close-btn"
            onClick={onClose}
            disabled={verifying}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="guest-otp-header">
          <div className="guest-otp-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10e760" strokeWidth="2">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <polyline points="3 7 12 13 21 7" />
            </svg>
          </div>
          <h3 id="otp-dialog-title">Xác thực Email đặt sân</h3>
          <p className="guest-otp-desc">
            Mã OTP gồm 6 chữ số đã được gửi tới:
            <br />
            <strong>{email}</strong>
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="guest-otp-inputs" onPaste={handlePaste}>
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => {
                  inputRefs.current[index] = el;
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                disabled={verifying}
                aria-label={`Số thứ ${index + 1}`}
                className="guest-otp-digit"
              />
            ))}
          </div>

          {error && <p className="guest-otp-error" role="alert">{error}</p>}

          <div className="guest-otp-actions">
            <button
              type="submit"
              className="arena-btn-primary btn-full"
              disabled={!isComplete || verifying}
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
                  onClick={handleResendClick}
                  disabled={resending}
                >
                  {resending ? 'Đang gửi lại…' : 'Gửi lại mã OTP'}
                </button>
              )}
            </div>

            <button
              type="button"
              className="guest-otp-cancel-btn"
              onClick={onClose}
              disabled={verifying}
            >
              Đổi thông tin hoặc Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
