'use client';

import React, { useState, useEffect } from 'react';
import { useCourtCatalog } from '../../features/courts/hooks/use-court-catalog';
import { ArenaCourtTabs } from '../../features/courts/components/arena-court-switcher';
import { CourtInfoCard } from '../../features/courts/components/court-info-card';
import {
  GuestBookingModal,
  type GuestHoldCreated,
} from '../../features/payment/components/guest-booking-form';
import { GuestManagePanel } from '../../features/payment/components/guest-manage-panel';
import { BookingQrModal } from '../../features/payment/components/booking-qr-modal';
import {
  PendingBookingAlert,
  getPendingBooking,
  clearPendingBooking,
  type PendingBookingState,
} from '../../features/booking/components/pending-booking-alert';
import { ArenaBookingHeading } from './arena-booking-heading';
import { ArenaShell } from './arena-shell';
import { ArenaLoadStatus } from './arena-load-status';

export function ArenaBookingPage() {
  const catalog = useCourtCatalog();
  const [selectedId, setSelectedId] = useState('');
  const prepaymentPercent = 30 as const;
  const [guestHold, setGuestHold] = useState<GuestHoldCreated | null>(null);

  // Guest booking modal state & prefilled parameters
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<{ start: string; end: string } | null>(null);
  const [selectedQuote, setSelectedQuote] = useState<{ totalAmount?: number; prepaymentAmount?: number } | null>(null);

  // Pending booking recovery state
  const [pendingAlert, setPendingAlert] = useState<PendingBookingState | null>(null);

  // Active QR Modal state
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

  // Kiểm tra đơn pending khi mount hoặc khi đổi sân
  useEffect(() => {
    const existing = getPendingBooking();
    if (existing) {
      setPendingAlert(existing);
    }
  }, [selectedId]);

  // Phục hồi đơn qua query URL (?recover=<bookingId>&token=<accessToken>)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const recoverBookingId = searchParams.get('recover');
    const token = searchParams.get('token');

    if (recoverBookingId) {
      if (token) {
        try {
          sessionStorage.setItem(`guest-manage-token:${recoverBookingId}`, token);
        } catch {
          // ignore
        }
      }
      const existing = getPendingBooking();
      if (existing && existing.bookingId === recoverBookingId) {
        setActiveQr({
          bookingId: existing.bookingId,
          bookingCode: existing.bookingCode,
          courtName: existing.courtName,
          courtCode: existing.courtCode,
          startsAt: existing.startsAt,
          endsAt: existing.endsAt,
          totalAmount: existing.totalAmount,
          prepaymentAmount: existing.prepaymentAmount,
          holdExpiresAt: existing.holdExpiresAt,
        });
      } else {
        setActiveQr({
          bookingId: recoverBookingId,
          bookingCode: `BK-${recoverBookingId.slice(0, 8).toUpperCase()}`,
          courtName: court?.name,
          courtCode: court?.code,
          prepaymentAmount: 0,
          holdExpiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });
      }
    }
  }, [court?.name, court?.code]);

  function handleOpenGuestModal(params: {
    courtId: string;
    courtName?: string;
    courtCode?: string;
    window: { start: string; end: string };
    totalAmount?: number;
    prepaymentAmount?: number;
  }) {
    setSelectedWindow(params.window);
    setSelectedQuote({
      totalAmount: params.totalAmount,
      prepaymentAmount: params.prepaymentAmount,
    });
    setGuestModalOpen(true);
  }

  function handleSelectCourt(id: string) {
    if (activeQr) return; // Khóa không cho đổi sân khi đang mở modal thanh toán
    setSelectedId(id);
    const existing = getPendingBooking();
    if (existing) {
      setPendingAlert(existing);
    }
  }

  function handleGuestCreated(result: GuestHoldCreated) {
    setGuestHold(result);
    setActiveQr({
      bookingId: result.bookingId,
      bookingCode: result.bookingCode,
      courtName: court?.name,
      courtCode: court?.code,
      totalAmount: result.totalAmount,
      prepaymentAmount: result.prepaymentAmount,
      holdExpiresAt: result.holdExpiresAt,
    });
  }

  function handleResumePending() {
    if (!pendingAlert) return;
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

  function handleCancelPending() {
    clearPendingBooking();
    setGuestHold(null);
    setActiveQr(null);
    setPendingAlert(null);
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
            <strong>Chính sách đặt cọc:</strong> Áp dụng đặt cọc bắt buộc đúng <strong>30% tiền thuê sân</strong> cho tất cả khách hàng (thành viên và khách vãng lai). 70% tiền thuê sân còn lại sẽ được thanh toán sau theo quy trình tại cơ sở.
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
              Đã giữ chỗ khách <strong>{guestHold.bookingCode}</strong> — mở checkout trước{' '}
              {guestHold.holdExpiresAt}.
            </p>
            <GuestManagePanel
              bookingId={guestHold.bookingId}
              token={guestHold.accessToken}
            />
          </div>
        )}
      </main>

      {/* Modal đặt sân dành cho khách chưa có tài khoản (khách vãng lai) - đặt ngoài main để không bị stacking context của main/footer che khuất */}
      {court && (
        <GuestBookingModal
          isOpen={guestModalOpen}
          onClose={() => setGuestModalOpen(false)}
          courtId={court.id}
          courtName={court.name}
          courtCode={court.code}
          timezone={court.timezone}
          preselectedWindow={selectedWindow ?? undefined}
          totalAmount={selectedQuote?.totalAmount}
          prepaymentAmount={selectedQuote?.prepaymentAmount}
          onCreated={handleGuestCreated}
        />
      )}

      {/* Modal Popup QR Code thanh toán (PayOS / VietQR) có backdrop khóa giao diện bên ngoài */}
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
          onClose={() => setActiveQr(null)}
        />
      )}
    </ArenaShell>
  );
}
