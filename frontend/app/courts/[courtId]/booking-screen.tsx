'use client';

import { cancelCheckoutHold } from '../../../features/payment/api/cancel-checkout-hold';
import React, { useState } from 'react';
import Link from 'next/link';
import { CourtInfoCard } from '../../../features/courts/components/court-info-card';
import { useCourtDetail } from '../../../features/courts/hooks/use-court-detail';
import { ArenaCourtSwitcher } from '../../../features/courts/components/arena-court-switcher';
import { ArenaShell } from '../../../components/arena/arena-shell';
import { ArenaBookingHeading } from '../../../components/arena/arena-booking-heading';
import {
  GuestBookingModal,
  type GuestHoldCreated,
} from '../../../features/payment/components/guest-booking-form';
import { BookingQrModal } from '../../../features/payment/components/booking-qr-modal';
import {
  PendingBookingAlert,
  clearPendingBooking,
  type PendingBookingState,
} from '../../../features/booking/components/pending-booking-alert';

export function BookingScreen({
  courtId,
  preselectedWindow,
}: {
  courtId: string;
  preselectedWindow?: { startsAt: string; endsAt: string };
}) {
  const { court, isLoading, error, retry } = useCourtDetail(courtId);

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

  function handleGuestCreated(result: GuestHoldCreated) {
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

  async function handleCancelPending() {
    const bookingId = activeQr?.bookingId ?? pendingAlert?.bookingId;
    if (!bookingId) throw new Error('Không tìm thấy đơn cần hủy.');
    await cancelCheckoutHold(bookingId, pendingAlert?.type ?? 'guest');
    clearPendingBooking();
    window.dispatchEvent(new Event('booking-hold-released'));
    setActiveQr(null);
    setPendingAlert(null);
  }

  return (
    <ArenaShell page="booking">
      <main className="arena-main booking-live arena-booking-page">
        <nav className="arena-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Trang chủ</Link>
          <span>/</span>
          <span aria-current="page">{court?.name ?? 'Đặt sân'}</span>
        </nav>
        <ArenaBookingHeading />
        <ArenaCourtSwitcher selectedId={courtId} />
        {isLoading && <p role="status">Đang tải thông tin sân…</p>}
        {error && (
          <p role="alert">
            {error}{' '}
            <button className="arena-button" onClick={retry}>
              Thử lại
            </button>
          </p>
        )}
        {pendingAlert && (
          <PendingBookingAlert
            pending={pendingAlert}
            onResume={handleResumePending}
            onCancel={handleCancelPending}
          />
        )}
        {court && (
          <CourtInfoCard
            key={court.id}
            court={court}
            preselectedWindow={preselectedWindow}
            onGuestBook={handleOpenGuestModal}
          />
        )}
      </main>

      {/* Modal đặt sân khách vãng lai */}
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

      {/* Modal QR thanh toán */}
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
