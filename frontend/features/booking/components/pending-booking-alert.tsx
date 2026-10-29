'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { formatVnd, formatBookingDate } from '../model/booking-time';
import { usePaymentCountdown, formatCountdown } from '../../payment/hooks/use-payment-countdown';

export interface PendingBookingState {
  bookingId: string;
  bookingCode: string;
  courtId: string;
  courtName?: string;
  courtCode?: string;
  startsAt: string;
  endsAt: string;
  totalAmount?: number;
  prepaymentAmount: number;
  holdExpiresAt: string;
  accessToken?: string;
  type: 'guest' | 'member';
}

const STORAGE_KEY = 'arena_pending_booking_v1';

export function savePendingBooking(state: PendingBookingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Tab riêng tư hoặc không hỗ trợ localStorage
  }
}

export function getPendingBooking(): PendingBookingState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingBookingState;
    if (new Date(parsed.holdExpiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingBooking() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function PendingBookingAlert({
  pending,
  onResume,
  onCancel,
}: {
  pending: PendingBookingState;
  onResume: () => void;
  onCancel: () => Promise<void> | void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const countdown = usePaymentCountdown({
    expiresAt: pending.holdExpiresAt,
    serverNow: null,
  });

  if (countdown.expired) {
    clearPendingBooking();
    return null;
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancel();
      clearPendingBooking();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div
      className="arena-pending-alert-banner"
      role="alert"
      aria-live="polite"
    >
      <div className="arena-pending-alert-content">
        <div className="arena-pending-icon-wrap">
          <span className="pending-badge-icon">⚠️</span>
        </div>
        <div className="arena-pending-text">
          <div className="arena-pending-heading">
            <strong>Bạn đang có đơn đặt sân chưa hoàn thành thanh toán!</strong>
            <span className="arena-pending-countdown" role="timer">
              Thời gian giữ chỗ còn: {formatCountdown(countdown.remainingMs)}
            </span>
          </div>
          <p className="arena-pending-desc">
            Mã đơn: <strong>{pending.bookingCode}</strong> — {pending.courtName || pending.courtCode || 'Sân đấu'} (
            {formatBookingDate(pending.startsAt)} {pending.startsAt.slice(11, 16)} – {pending.endsAt.slice(11, 16)}).
            Tiền cọc 30%: <strong>{formatVnd(pending.prepaymentAmount)}</strong>.
          </p>
        </div>
      </div>

      <div className="arena-pending-alert-actions">
        <button
          type="button"
          className="arena-btn-primary arena-btn-sm"
          onClick={onResume}
        >
          Tiếp tục thanh toán (QR)
        </button>
        <Link
          href="/bookings"
          className="arena-btn-secondary arena-btn-sm"
        >
          Lịch sử đặt sân
        </Link>
        <button
          type="button"
          className="arena-btn-danger arena-btn-sm"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? 'Đang hủy…' : 'Hủy đơn này'}
        </button>
      </div>
    </div>
  );
}
