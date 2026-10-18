'use client';
import { LiveBookingPanel } from '../../booking/components/live-booking-panel';
import type { CourtItem } from '../model/court';

export function CourtInfoCard({ court }: { court: CourtItem }) {
  return (
    <>
      <h1>{court.name}</h1>
      <p>
        {court.branchName} · {court.address}
      </p>
      <p>{court.surfaceType}</p>
      {court.timezone ? (
        <LiveBookingPanel
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
