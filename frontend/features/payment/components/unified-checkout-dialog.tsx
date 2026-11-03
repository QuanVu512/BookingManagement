'use client';

import React, { useCallback, useEffect, useRef } from 'react';
import { GuestBookingModal, type GuestHoldCreated } from './guest-booking-form';
import { BookingQrModal } from './booking-qr-modal';
import {
  savePendingBooking,
  type PendingBookingState,
} from '../../booking/components/pending-booking-alert';

export interface UnifiedCheckoutParams {
  courtId: string;
  courtName?: string;
  courtCode?: string;
  window: { start: string; end: string };
  totalAmount?: number;
  prepaymentAmount?: number;
}

export interface UnifiedCheckoutDialogProps extends UnifiedCheckoutParams {
  isOpen: boolean;
  /** Đóng chỉ ẩn dialog, tuyệt đối không hủy giữ chỗ (AC-24, R5). */
  onClose: () => void;
  onCancelHold: () => Promise<void> | void;
  onHoldCreated?: (hold: GuestHoldCreated) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
  timezone?: string;
}

function focusableElements(root: HTMLElement): HTMLElement[] {
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
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      if (el.offsetParent !== null || el === document.activeElement) return true;
      // JSDOM / môi trường test không tính CSS layout nên offsetParent luôn là null.
      if (typeof window !== 'undefined' && el.offsetParent === null) {
        return true;
      }
      return false;
    },
  );
}

/**
 * Bước 4 — Hộp thoại đặt sân đồng nhất (Unified Checkout Dialog).
 *
 * Hợp nhất bước nhập thông tin khách (GuestBookingModal) và bước quét mã QR
 * (BookingQrModal) vào một vòng đời mở/đóng duy nhất:
 * - Một `isOpen` điều phối cả hai pha `form` → `qr`, không còn giật cục do
 *   đóng/mở hai modal rời rạc.
 * - Bẫy tiêu điểm (Focus Trap) chuẩn WCAG 2.2 AA: Tab/Shift+Tab tuần hoàn trong
 *   dialog; ESC hoặc nút [X] của từng pha chỉ gọi `onClose` (ẩn dialog).
 * - Đóng dialog sau khi đã giữ chỗ TUYỆT ĐỐI không gọi hủy giữ chỗ; đơn được
 *   lưu vào `localStorage` và theo dõi tiếp qua `PendingBookingAlert`.
 * - Đóng/mở dialog trả tiêu điểm về đúng nút đã kích hoạt (`triggerRef`).
 */
export function UnifiedCheckoutDialog({
  isOpen,
  onClose,
  onCancelHold,
  onHoldCreated,
  triggerRef,
  timezone,
  ...params
}: UnifiedCheckoutDialogProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const [hold, setHold] = React.useState<GuestHoldCreated | null>(null);
  const holdRef = useRef<GuestHoldCreated | null>(null);
  holdRef.current = hold;

  const handleCreated = useCallback(
    (result: GuestHoldCreated) => {
      setHold(result);
      try {
        const pending: PendingBookingState = {
          bookingId: result.bookingId,
          bookingCode: result.bookingCode,
          courtId: params.courtId,
          courtName: params.courtName,
          courtCode: params.courtCode,
          startsAt: params.window.start,
          endsAt: params.window.end,
          totalAmount: result.totalAmount,
          prepaymentAmount: result.prepaymentAmount,
          holdExpiresAt: result.holdExpiresAt,
          accessToken: result.accessToken,
          type: 'guest',
        };
        savePendingBooking(pending);
      } catch {
        // Tab riêng tư: vẫn giữ hold trong memory của dialog.
      }
      onHoldCreated?.(result);
    },
    [
      onHoldCreated,
      params.courtId,
      params.courtName,
      params.courtCode,
      params.window,
      params.totalAmount,
      params.prepaymentAmount,
    ],
  );

  // ESC đóng an toàn + bẫy Tab tuần hoàn trong dialog (AC-24).
  useEffect(() => {
    if (!isOpen) return;
    const shell = shellRef.current;
    // Focus phần tử tương tác đầu tiên khi mở.
    const initial = shell ? focusableElements(shell)[0] : null;
    initial?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !shell) return;
      const items = focusableElements(shell);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const outside = !active || !shell.contains(active);
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
  }, [isOpen, onClose, hold]);

  // Trả tiêu điểm về nút kích hoạt khi đóng (AC-24 Focus Restoration).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) {
      setHold(null);
      triggerRef?.current?.focus?.();
    }
    wasOpen.current = isOpen;
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={shellRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="unified-checkout-title"
    >
      <span id="unified-checkout-title" className="sr-only">
        Đặt sân khách vãng lai và thanh toán cọc 30%
      </span>
      {!hold ? (
        <GuestBookingModal
          isOpen
          onClose={onClose}
          courtId={params.courtId}
          courtName={params.courtName}
          courtCode={params.courtCode}
          timezone={timezone}
          preselectedWindow={params.window}
          totalAmount={params.totalAmount}
          prepaymentAmount={params.prepaymentAmount}
          onCreated={handleCreated}
          stayOpenOnCreated
        />
      ) : (
        <BookingQrModal
          isOpen
          bookingId={hold.bookingId}
          bookingCode={hold.bookingCode}
          courtName={params.courtName}
          courtCode={params.courtCode}
          startsAt={params.window.start}
          endsAt={params.window.end}
          totalAmount={hold.totalAmount}
          prepaymentAmount={hold.prepaymentAmount}
          holdExpiresAt={hold.holdExpiresAt}
          onCancel={onCancelHold}
          onClose={onClose}
        />
      )}
    </div>
  );
}
