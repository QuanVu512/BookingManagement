'use client';

import Link from 'next/link';
import { CourtInfoCard } from '../../../features/courts/components/court-info-card';
import { useCourtDetail } from '../../../features/courts/hooks/use-court-detail';
import { ArenaCourtSwitcher } from '../../../features/courts/components/arena-court-switcher';
import { ArenaShell } from '../../../components/arena/arena-shell';
import { ArenaBookingHeading } from '../../../components/arena/arena-booking-heading';

export function BookingScreen({ courtId }: { courtId: string }) {
  const { court, isLoading, error, retry } = useCourtDetail(courtId);
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
        {court && <CourtInfoCard key={court.id} court={court} />}
      </main>
    </ArenaShell>
  );
}
