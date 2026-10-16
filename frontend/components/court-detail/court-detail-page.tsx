'use client';
import Link from 'next/link';
import type { CourtItem } from '../../types/auth';
import { useCourtDetail } from '../../hooks/use-court-detail';
import { SportyHeader } from '../home/sporty-header';
import { AuthModal } from '../auth/auth-modal';
import { LiveBookingForm } from '../booking/live-booking-form';

export function CourtDetailPage({ courtId }: { courtId: string }) {
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
        {court && <CourtInformation court={court} />}
      </main>
      <AuthModal />
    </>
  );
}

function CourtInformation({ court }: { court: CourtItem }) {
  return (
    <>
      <h1>{court.name}</h1>
      <p>
        {court.branchName} · {court.address}
      </p>
      <p>{court.surfaceType}</p>
      {court.timezone ? (
        <LiveBookingForm
          key={court.id}
          courtId={court.id}
          timezone={court.timezone}
        />
      ) : (
        <p role="alert">Thiếu cấu hình múi giờ của sân. Chưa thể đặt.</p>
      )}
    </>
  );
}
