'use client';

import { useState } from 'react';
import { requestGuestRecoveryLink } from '../api/payment-service';

type LookupStatus = 'idle' | 'sending' | 'done' | 'error';

/**
 * Form tra cứu đơn giữ chỗ cho khách vãng lai (Task 5.3, AC-22).
 * Một ô nhập SĐT hoặc email, nút gửi, thông báo chung qua aria-live.
 * Máy chủ luôn trả cùng nội dung nên màn hình không bao giờ lộ có/không có đơn.
 */
export function GuestLookupForm() {
  const [contact, setContact] = useState('');
  const [status, setStatus] = useState<LookupStatus>('idle');
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const value = contact.trim();
    if (value.length < 3) {
      setFieldError('Vui lòng nhập số điện thoại hoặc email đã dùng khi đặt sân.');
      return;
    }
    setFieldError('');
    setStatus('sending');
    setMessage('');
    try {
      const result = await requestGuestRecoveryLink(value);
      setMessage(result.message);
      setStatus('done');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Chưa gửi được yêu cầu. Vui lòng thử lại.',
      );
      setStatus('error');
    }
  }

  return (
    <form
      className="guest-lookup-form"
      onSubmit={(event) => void handleSubmit(event)}
      aria-label="Tra cứu đơn giữ chỗ"
    >
      <div className="guest-input-group">
        <label htmlFor="guest-lookup-contact">
          Số điện thoại hoặc email đặt sân
        </label>
        <input
          id="guest-lookup-contact"
          name="contact"
          className="guest-input-field"
          placeholder="0912345678 hoặc email@example.com"
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          disabled={status === 'sending'}
          autoComplete="tel email"
          required
          minLength={3}
          maxLength={150}
        />
        {fieldError ? (
          <p className="guest-form-alert" role="alert">
            {fieldError}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="arena-btn-primary"
        disabled={status === 'sending' || contact.trim().length < 3}
      >
        {status === 'sending' ? 'Đang gửi…' : 'Gửi liên kết khôi phục'}
      </button>
      {message ? (
        <p
          className="guest-form-note"
          role={status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
