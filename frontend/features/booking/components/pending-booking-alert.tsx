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
    if (!parsed || typeof parsed.bookingId !== 'string') return null;
    // R4 (S4-P2-1): không xóa bản ghi khôi phục chỉ vì đồng hồ máy client đã
    // vượt hạn. Trạng thái hết hạn thật do server xác nhận; component hiển thị
    // quyết định theo server, không theo Date.now() lúc đọc storage.
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
  const [cancelError, setCancelError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const countdown = usePaymentCountdown({
    expiresAt: pending.holdExpiresAt,
    serverNow: null,
    // R1 (S4-P1-1): hết giờ client chỉ đọc lại trạng thái bằng GET do component
    // cha truyền qua onResume; không tự gán EXPIRED, không xóa storage tại đây.
    onExpired: undefined,
  });

  // R4 (S4-P2-1) + AC-24: không side-effect trong thân render. Khi hết giờ
  // client, GIỮ bản ghi và thanh cảnh báo, hiện trạng thái "đang kiểm tra lại"
  // kèm nút đọc lại (GET) — chỉ xóa storage khi hủy thành công có server xác nhận.
  if (countdown.expired) {
    return (
      <div
        className="arena-pending-alert-banner"
        role="status"
        aria-live="polite"
      >
        <div className="arena-pending-alert-content">
          <div className="arena-pending-icon-wrap">
            <span className="pending-badge-icon">⏰</span>
          </div>
          <div className="arena-pending-text">
            <div className="arena-pending-heading">
              <strong>Hết thời gian giữ chỗ hiển thị — đang kiểm tra lại trạng thái đơn.</strong>
            </div>
            <p className="arena-pending-desc">
              Mã đơn: <strong>{pending.bookingCode}</strong> — {pending.courtName || pending.courtCode || 'Sân đấu'}.
              Khung giờ chưa chắc đã được giải phóng; bấm đọc lại để nhận kết quả mới nhất từ máy chủ.
            </p>
          </div>
        </div>

        <div className="arena-pending-alert-actions">
          {cancelError && <p role="alert">{cancelError}</p>}
          <button
            type="button"
            className="arena-btn-primary arena-btn-sm"
            onClick={onResume}
          >
            Đọc lại trạng thái đơn
          </button>
          <Link
            href="/bookings"
            className="arena-btn-secondary arena-btn-sm"
          >
            Lịch sử đặt sân
          </Link>
          {!confirmCancel ? (
            <button
              type="button"
              className="arena-btn-danger arena-btn-sm"
              onClick={() => setConfirmCancel(true)}
            >
              Hủy đơn này
            </button>
          ) : (
            <>
              <span role="note">Xác nhận hủy giữ chỗ này?</span>
              <button
                type="button"
                className="arena-btn-danger arena-btn-sm"
                onClick={() => void handleCancel()}
                disabled={cancelling}
              >
                {cancelling ? 'Đang hủy…' : 'Xác nhận hủy'}
              </button>
              <button
                type="button"
                className="arena-btn-secondary arena-btn-sm"
                onClick={() => setConfirmCancel(false)}
                disabled={cancelling}
              >
                Giữ lại đơn
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      setCancelError('');
      await onCancel();
      // Chỉ xóa storage khi máy chủ đã xác nhận hủy thành công (R4).
      clearPendingBooking();
      setConfirmCancel(false);
    } catch (error) {
      // Lỗi mạng/server: GIỮ nguyên cảnh báo, báo rõ, không xóa storage.
      setCancelError(error instanceof Error ? error.message : 'Chưa xác nhận được hủy, vui lòng thử lại.');
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
        {cancelError && <p role="alert">{cancelError}</p>}
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
        {!confirmCancel ? (
          <button
            type="button"
            className="arena-btn-danger arena-btn-sm"
            onClick={() => setConfirmCancel(true)}
          >
            Hủy đơn này
          </button>
        ) : (
          <>
            <span role="note">Xác nhận hủy giữ chỗ này?</span>
            <button
              type="button"
              className="arena-btn-danger arena-btn-sm"
              onClick={() => void handleCancel()}
              disabled={cancelling}
            >
              {cancelling ? 'Đang hủy…' : 'Xác nhận hủy'}
            </button>
            <button
              type="button"
              className="arena-btn-secondary arena-btn-sm"
              onClick={() => setConfirmCancel(false)}
              disabled={cancelling}
            >
              Giữ lại đơn
            </button>
          </>
        )}
      </div>
    </div>
  );
}
