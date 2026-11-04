import { LiveBookingPanel } from '../../booking/components/live-booking-panel';
import { formatVnd } from '../../booking/model/booking-time';
import { CourtPhotoGallery } from './court-photo-gallery';
import type { CourtItem } from '../model/court';

function CourtHeading({ court }: { court: CourtItem }) {
  const venue = Array.from(
    new Set([court.branchName, court.address].filter(Boolean)),
  ).join(' · ');
  return (
    <>
      <div className="detail-section-heading">
        <span className="court-type-label">
          {court.courtType === 'VIP' ? 'Sân VIP' : 'Sân tiêu chuẩn'}
        </span>
        <span className="detail-muted">{court.code}</span>
      </div>
      <h1>{court.name}</h1>
      {venue && <p className="court-detail-venue">{venue}</p>}
    </>
  );
}

function CourtFeatures({ court }: { court: CourtItem }) {
  const showSurface =
    Boolean(court.surfaceType) &&
    court.surfaceType !== 'Sân Pickleball trong nhà Cushion Pro';
  const visibleFeatures = (court.features ?? []).filter(
    (feature) => feature !== 'Vệ sinh theo yêu cầu',
  );
  return (
    <>
      {showSurface && (
        <p className="court-detail-surface">{court.surfaceType}</p>
      )}
      {visibleFeatures.length > 0 && (
        <ul className="court-detail-features">
          {visibleFeatures.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      )}
      <div className="court-detail-price">
        <span>Giá tham khảo từ</span>
        <strong>
          {court.pricePerHour > 0
            ? `${formatVnd(court.pricePerHour)}/giờ`
            : 'Chưa có giá'}
        </strong>
      </div>
    </>
  );
}

function CourtOverview({ court }: { court: CourtItem }) {
  return (
    <article
      className="detail-panel court-detail-info"
      aria-label="Thông tin sân"
    >
      <CourtHeading court={court} />
      <CourtFeatures court={court} />
      <details className="arena-court-gallery">
        <summary>Xem hình ảnh sân</summary>
        <CourtPhotoGallery
          key={court.id}
          src={court.imageUrl}
          courtName={court.name}
        />
      </details>
    </article>
  );
}

export function CourtInfoCard({
  court,
  prepaymentPercent = 30,
  preselectedWindow,
  onGuestBook,
}: {
  court: CourtItem;
  prepaymentPercent?: 30 | 100;
  preselectedWindow?: { startsAt: string; endsAt: string };
  onGuestBook?: (params: {
    courtId: string;
    courtName?: string;
    courtCode?: string;
    window: { start: string; end: string };
    totalAmount?: number;
    prepaymentAmount?: number;
  }) => void;
}) {
  if (!court.timezone)
    return (
      <>
        <CourtOverview court={court} />
        <p role="alert">Thiếu cấu hình múi giờ của sân. Chưa thể đặt.</p>
      </>
    );
  return (
    <LiveBookingPanel
      courtId={court.id}
      timezone={court.timezone}
      prepaymentPercent={prepaymentPercent}
      preselectedWindow={preselectedWindow}
      onGuestBook={onGuestBook}
      detail={{
        name: court.name,
        code: court.code,
        pricePerHour: court.pricePerHour,
        overview: <CourtOverview court={court} />,
      }}
    />
  );
}
