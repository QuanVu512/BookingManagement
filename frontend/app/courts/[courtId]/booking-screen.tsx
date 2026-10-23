'use client';
import Link from 'next/link';
import { SportyHeader } from '../../../components/home/sporty-header';
import { CourtInfoCard } from '../../../features/courts/components/court-info-card';
import { useCourtDetail } from '../../../features/courts/hooks/use-court-detail';

export function BookingScreen({ courtId }: { courtId: string }) {
  const { court, isLoading, error, retry } = useCourtDetail(courtId);
  return (
    <>
      <SportyHeader currentPage="court-detail" />
      <main className="container booking-live">
        <Link href="/">← Danh sách sân</Link> ·{' '}
        <Link href="/bookings">Booking của tôi</Link>
        {isLoading && <p role="status">Đang tải thông tin sân…</p>}
        {error && (
          <p role="alert">
            {error}{' '}
            <button className="btn btn-secondary" onClick={retry}>
              Thử lại
            </button>
          </p>
        )}
        {court && <CourtInfoCard court={court} />}
      </main>
    </>
  );
}
