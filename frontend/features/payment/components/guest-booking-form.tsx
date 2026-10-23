'use client';
import { useState } from 'react';
import {
  formatVnd,
  DEFAULT_BOOKING_TIMEZONE,
  assertBookableWindow,
  localInputToIso,
} from '../../booking/model/booking-time';
import { BookingDateTimeInput } from '../../booking/components/booking-schedule-picker';
import { createGuestBooking, newIdempotencyKey } from '../api/payment-service';

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
 * FE-PAY-04 — Form guest giữ sân 100% (MIG-11, MIG-17).
 * Token lưu sessionStorage theo tab; UI nêu rõ giới hạn: mất token phải
 * liên hệ quầy cấp lại (không có self-serve email). Không hardcode số tiền.
 */
export function GuestBookingForm({
  courtId,
  timezone = DEFAULT_BOOKING_TIMEZONE,
  onCreated,
}: {
  courtId: string;
  timezone?: string;
  onCreated: (result: GuestHoldCreated) => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<GuestHoldCreated | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (
      !name.trim() ||
      !phone.trim() ||
      !email.trim() ||
      !startsAt ||
      !endsAt
    ) {
      setError('Vui lòng nhập đầy đủ họ tên, điện thoại, email và khung giờ.');
      return;
    }
    setSubmitting(true);
    try {
      assertBookableWindow({ start: startsAt, end: endsAt }, timezone);
      const result = await createGuestBooking({
        courtId,
        startsAt: localInputToIso(startsAt, timezone),
        endsAt: localInputToIso(endsAt, timezone),
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim(),
        idempotencyKey: newIdempotencyKey(),
      });
      try {
        sessionStorage.setItem(
          `${TOKEN_STORAGE_KEY}:${result.bookingId}`,
          result.accessToken,
        );
      } catch {
        // Tab riêng tư: token chỉ tồn tại trong bộ nhớ phiên này.
      }
      setCreated(result);
      onCreated(result);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Không tạo được giữ chỗ.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Đặt sân cho khách vãng lai">
      <h2>Đặt sân (khách vãng lai — thanh toán 100%)</h2>
      <form onSubmit={submit}>
        <p>
          <label>
            Họ tên
            <input
              name="customerName"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </label>
        </p>
        <p>
          <label>
            Điện thoại
            <input
              name="customerPhone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
              required
            />
          </label>
        </p>
        <p>
          <label>
            Email
            <input
              name="customerEmail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
        </p>
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
        {error && <p role="alert">{error}</p>}
        <p>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Đang giữ chỗ…' : 'Giữ chỗ và thanh toán 100%'}
          </button>
        </p>
      </form>
      {created && (
        <div role="status">
          <p>
            Mã đơn <strong>{created.bookingCode}</strong> — số tiền{' '}
            {formatVnd(created.prepaymentAmount)}.
          </p>
          <p>
            Mã truy cập đã lưu trong tab này. Nếu mất mã, liên hệ quầy để được
            cấp lại sau khi xác minh — không gửi mã qua email tự động.
          </p>
        </div>
      )}
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
