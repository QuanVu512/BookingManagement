'use client';

import { cancelCheckoutHold } from '../../features/payment/api/cancel-checkout-hold';
import React, { useState, useEffect, useRef } from 'react';
import { useCourtCatalog } from '../../features/courts/hooks/use-court-catalog';
import { ArenaCourtTabs } from '../../features/courts/components/arena-court-switcher';
import { CourtInfoCard } from '../../features/courts/components/court-info-card';
import {
  UnifiedCheckoutDialog,
  type UnifiedCheckoutParams,
} from '../../features/payment/components/unified-checkout-dialog';
import { GuestManagePanel } from '../../features/payment/components/guest-manage-panel';
import { BookingQrModal } from '../../features/payment/components/booking-qr-modal';
import type { GuestHoldCreated } from '../../features/payment/components/guest-booking-form';
import {
  PendingBookingAlert,
  getPendingBooking,
  clearPendingBooking,
  type PendingBookingState,
} from '../../features/booking/components/pending-booking-alert';
import { ArenaBookingHeading } from './arena-booking-heading';
import Link from 'next/link';
import { useRecoveryLink } from '../../features/payment/hooks/use-recovery-link';
import { ArenaShell } from './arena-shell';
import { ArenaLoadStatus } from './arena-load-status';

export function ArenaBookingPage() {
  const catalog = useCourtCatalog();
  const [selectedId, setSelectedId] = useState('');
  const prepaymentPercent = 30 as const;
  const [guestHold, setGuestHold] = useState<GuestHoldCreated | null>(null);

  // Bước 4: một dialog hợp nhất thay cho hai modal rời rạc trước đây.
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutParams, setCheckoutParams] =
    useState<UnifiedCheckoutParams | null>(null);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  // Giữ tương thích pha QR cũ (resume từ cảnh báo pending mở lại đúng pha QR).
  const [pendingAlert, setPendingAlert] = useState<PendingBookingState | null>(
    null,
  );
  // STEP4-P1-2: mở QR từ resume (cảnh báo pending/link khôi phục) thì chỉ đọc
  // recovery (GET), không POST tạo payment khi mount.
  const [qrResumeOnly, setQrResumeOnly] = useState(false);

  const [activeQr, setActiveQr] = useState<{
    bookingId: string;
    bookingCode: string;
    courtName?: string;
    courtCode?: string;
    startsAt?: string;
    endsAt?: string;
    totalAmount?: number;
    prepaymentAmount: number;
    holdExpiresAt?: string;
    checkoutUrl?: string;
    vietQrPayload?: string;
  } | null>(null);

  const court =
    catalog.courts.find((item) => item.id === selectedId) ?? catalog.courts[0];

  // Chọn sẵn sân từ query ?courtId= nếu có trên URL
  useEffect(() => {
    if (selectedId || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const initialCourtId = params.get('courtId');
    if (
      initialCourtId &&
      catalog.courts.some((item) => item.id === initialCourtId)
    ) {
      setSelectedId(initialCourtId);
    }
  }, [catalog.courts, selectedId]);

  // Kiểm tra đơn pending khi mount hoặc khi đổi sân
  useEffect(() => {
    const existing = getPendingBooking();
    if (existing) {
      setPendingAlert(existing);
    }
  }, [selectedId]);

  // Task 5.2 — phục hồi đơn từ link email: mã đơn ở query (?recover=, không
  // bí mật), mã bí mật ở fragment (#recovery=). Hook đọc xong xóa sạch URL
  // (AC-19), đồng hồ theo giờ máy chủ từ GET /recovery (AC-14).
  const recoveryLink = useRecoveryLink();
  useEffect(() => {
    if (recoveryLink.status !== 'ready' || !recoveryLink.snapshot) return;
    const snapshotBooking = recoveryLink.snapshot.booking;
    // Mở QR ở chế độ chỉ-đọc (GET), không POST tạo thanh toán khi mount.
    setQrResumeOnly(true);
    setActiveQr({
      bookingId: snapshotBooking.id,
      bookingCode: snapshotBooking.code,
      courtName: snapshotBooking.courtName,
      courtCode: snapshotBooking.courtCode,
      startsAt: snapshotBooking.startsAt,
      endsAt: snapshotBooking.endsAt,
      totalAmount: snapshotBooking.totalAmount,
      prepaymentAmount: snapshotBooking.prepaymentAmount,
      holdExpiresAt: snapshotBooking.holdExpiresAt,
    });
  }, [recoveryLink.status, recoveryLink.snapshot]);

  function handleOpenGuestModal(params: UnifiedCheckoutParams) {
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active instanceof HTMLElement) lastTriggerRef.current = active;
    }
    setCheckoutParams(params);
    setCheckoutOpen(true);
  }

  function handleSelectCourt(id: string) {
    if (checkoutOpen || activeQr) return; // Khóa không cho đổi sân khi đang mở dialog thanh toán
    setSelectedId(id);
    const existing = getPendingBooking();
    if (existing) {
      setPendingAlert(existing);
    }
  }

  function handleGuestCreated(result: GuestHoldCreated) {
    setGuestHold(result);
    // Dialog hợp nhất tự chuyển sang pha QR; không mở thêm modal rời rạc.
    // Đồng bộ cảnh báo pending ngay để nút hủy trong dialog tìm đúng đơn
    // (STEP4-P1-1 dependency: cancel theo chính booking vừa tạo).
    const saved = getPendingBooking();
    if (saved && saved.bookingId === result.bookingId) {
      setPendingAlert(saved);
    }
  }

  function handleResumePending() {
    if (!pendingAlert) return;
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active instanceof HTMLElement) lastTriggerRef.current = active;
    }
    // STEP4-P1-2:Resume chỉ đọc — modal mở ở chế độ resumeOnly.
    setQrResumeOnly(true);
    setActiveQr({
      bookingId: pendingAlert.bookingId,
      bookingCode: pendingAlert.bookingCode,
      courtName: pendingAlert.courtName,
      courtCode: pendingAlert.courtCode,
      startsAt: pendingAlert.startsAt,
      endsAt: pendingAlert.endsAt,
      totalAmount: pendingAlert.totalAmount,
      prepaymentAmount: pendingAlert.prepaymentAmount,
      holdExpiresAt: pendingAlert.holdExpiresAt,
    });
  }

  function handleCheckoutClose() {
    // AC-24/R5: đóng chỉ ẩn dialog, tuyệt đối không hủy giữ chỗ ngầm.
    // Đơn còn hiệu lực được theo dõi tiếp qua PendingBookingAlert.
    const existing = getPendingBooking();
    if (existing) setPendingAlert(existing);
    setCheckoutOpen(false);
  }

  async function handleCancelPending() {
    const bookingId =
      activeQr?.bookingId ?? guestHold?.bookingId ?? pendingAlert?.bookingId;
    if (!bookingId) throw new Error('Không tìm thấy đơn cần hủy.');
    await cancelCheckoutHold(bookingId, pendingAlert?.type ?? 'guest');
    clearPendingBooking();
    window.dispatchEvent(new Event('booking-hold-released'));
    setGuestHold(null);
    setActiveQr(null);
    setPendingAlert(null);
    setCheckoutOpen(false);
  }

  return (
    <ArenaShell page="booking">
      <main className="arena-main booking-live arena-booking-page">
        <ArenaBookingHeading />
        <ArenaLoadStatus {...catalog} empty={!court} />

        {/* Cảnh báo đơn hàng chưa hoàn thành nếu người dùng quay lại web */}
        {pendingAlert && (
          <PendingBookingAlert
            pending={pendingAlert}
            onResume={handleResumePending}
            onCancel={handleCancelPending}
          />
        )}

        {/* Task 5.2 — trạng thái mở link phục hồi từ email */}
        {(recoveryLink.status === 'expired-hold' ||
          recoveryLink.status === 'expired-link' ||
          recoveryLink.status === 'invalid' ||
          recoveryLink.status === 'error') && (
          <div
            className="arena-recovery-notice"
            role={recoveryLink.status === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <p>{recoveryLink.message}</p>
            <p>
              {recoveryLink.status === 'error' && (
                <button
                  type="button"
                  className="arena-btn-secondary"
                  onClick={recoveryLink.retry}
                >
                  Thử lại
                </button>
              )}
              <Link href="/booking/lookup" className="arena-btn-secondary">
                Tìm lại đơn giữ chỗ
              </Link>
            </p>
          </div>
        )}

        <p className="arena-lookup-hint">
          <Link href="/booking/lookup">
            Tìm lại đơn giữ chỗ chưa thanh toán
          </Link>
        </p>

        <ArenaCourtTabs
          courts={catalog.courts}
          selectedId={court?.id ?? ''}
          onSelect={handleSelectCourt}
        />

        <section
          aria-label="Chính sách đặt cọc"
          style={{
            margin: '1rem 0',
            padding: '0.875rem 1.25rem',
            borderRadius: 'var(--radius-sm, 8px)',
            background: 'var(--surface-subtle, rgba(255, 255, 255, 0.03))',
            border: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
            fontSize: '0.875rem',
            lineHeight: 1.5,
          }}
        >
          <p role="note" style={{ margin: 0 }}>
            <strong>Chính sách đặt cọc:</strong> Áp dụng đặt cọc bắt buộc đúng{' '}
            <strong>30% tiền thuê sân</strong> cho tất cả khách hàng. 70% tiền
            thuê sân còn lại sẽ được thanh toán sau theo quy trình tại cơ sở.
          </p>
        </section>

        {court && (
          <CourtInfoCard
            key={`${court.id}:${prepaymentPercent}`}
            court={court}
            prepaymentPercent={prepaymentPercent}
            onGuestBook={handleOpenGuestModal}
          />
        )}

        {guestHold && (
          <div className="arena-guest-manage-section">
            <p role="status">
              Đã giữ chỗ khách <strong>{guestHold.bookingCode}</strong> — mở
              checkout trước {guestHold.holdExpiresAt}.
            </p>
            <GuestManagePanel
              bookingId={guestHold.bookingId}
              token={guestHold.accessToken}
            />
          </div>
        )}
      </main>

      {/* Bước 4: một dialog hợp nhất (form khách → QR) thay hai modal rời rạc.
          Đặt ngoài main để không bị stacking context che khuất. */}
      {court && checkoutParams && (
        <UnifiedCheckoutDialog
          isOpen={checkoutOpen}
          onClose={handleCheckoutClose}
          courtId={checkoutParams.courtId}
          courtName={checkoutParams.courtName}
          courtCode={checkoutParams.courtCode}
          window={checkoutParams.window}
          totalAmount={checkoutParams.totalAmount}
          prepaymentAmount={checkoutParams.prepaymentAmount}
          timezone={court.timezone}
          triggerRef={lastTriggerRef}
          onHoldCreated={handleGuestCreated}
          onCancelHold={handleCancelPending}
        />
      )}

      {/* Resume từ cảnh báo pending / link khôi phục: mở thẳng pha QR đã tồn tại */}
      {activeQr && (
        <BookingQrModal
          isOpen={Boolean(activeQr)}
          bookingId={activeQr.bookingId}
          bookingCode={activeQr.bookingCode}
          courtName={activeQr.courtName || court?.name}
          courtCode={activeQr.courtCode || court?.code}
          startsAt={activeQr.startsAt}
          endsAt={activeQr.endsAt}
          totalAmount={activeQr.totalAmount}
          prepaymentAmount={activeQr.prepaymentAmount}
          holdExpiresAt={activeQr.holdExpiresAt}
          checkoutUrl={activeQr.checkoutUrl}
          vietQrPayload={activeQr.vietQrPayload}
          onCancel={handleCancelPending}
          onClose={() => {
            setActiveQr(null);
            setQrResumeOnly(false);
            lastTriggerRef.current?.focus?.();
          }}
          resumeOnly={qrResumeOnly}
          triggerRef={lastTriggerRef}
        />
      )}
    </ArenaShell>
  );
}
