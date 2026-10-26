'use client';

import { useState } from 'react';
import { useCourtCatalog } from '../../features/courts/hooks/use-court-catalog';
import { ArenaCourtTabs } from '../../features/courts/components/arena-court-switcher';
import { CourtInfoCard } from '../../features/courts/components/court-info-card';
import {
  GuestBookingForm,
  type GuestHoldCreated,
} from '../../features/payment/components/guest-booking-form';
import { GuestManagePanel } from '../../features/payment/components/guest-manage-panel';
import { ArenaBookingHeading } from './arena-booking-heading';
import { ArenaShell } from './arena-shell';
import { ArenaLoadStatus } from './arena-load-status';

export function ArenaBookingPage() {
  const catalog = useCourtCatalog();
  const [selectedId, setSelectedId] = useState('');
  const prepaymentPercent: 30 = 30;
  const [guestHold, setGuestHold] = useState<GuestHoldCreated | null>(null);
  const court =
    catalog.courts.find((item) => item.id === selectedId) ?? catalog.courts[0];
  return (
    <ArenaShell page="booking">
      <main className="arena-main booking-live arena-booking-page">
        <ArenaBookingHeading />
        <ArenaLoadStatus {...catalog} empty={!court} />
        <ArenaCourtTabs
          courts={catalog.courts}
          selectedId={court?.id ?? ''}
          onSelect={setSelectedId}
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
          />
        )}
        {court && (
          <GuestBookingForm courtId={court.id} onCreated={setGuestHold} />
        )}
        {guestHold && (
          <>
            <p role="status">
              Đã giữ chỗ khách {guestHold.bookingCode} — mở checkout trước{' '}
              {guestHold.holdExpiresAt}.
            </p>
            <GuestManagePanel
              bookingId={guestHold.bookingId}
              token={guestHold.accessToken}
            />
          </>
        )}
      </main>
    </ArenaShell>
  );
}
