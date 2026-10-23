import Image from 'next/image';
import Link from 'next/link';
import type { CourtItem } from '../model/court';
import { COURT_DETAILS_ENABLED } from '../../../constants/features';
import { ArenaIcon } from '../../../components/arena/arena-icon';
import { formatVnd } from '../../booking/model/booking-time';

function CourtMedia({ court }: { court: CourtItem }) {
  return (
    <div className="arena-court-media">
      <Image
        src={court.imageUrl}
        alt={court.name}
        fill
        sizes="(max-width: 767px) 100vw, 600px"
        className="arena-court-image"
      />
      <CourtBadges court={court} />
      <span className="arena-court-rate">
        {court.pricePerHour > 0
          ? `${formatVnd(court.pricePerHour)} / Giờ`
          : 'Chưa có giá'}
        <small>Giá tham khảo</small>
      </span>
    </div>
  );
}

function CourtBadges({ court }: { court: CourtItem }) {
  return (
    <div className="arena-court-badges">
      <span
        className={
          court.courtType === 'VIP'
            ? 'arena-badge arena-badge-vip'
            : 'arena-badge'
        }
      >
        {court.courtType === 'VIP' ? 'SÂN VIP' : 'TIÊU CHUẨN'}
      </span>
      <span className="arena-code">{court.code}</span>
    </div>
  );
}

function CourtFeatures({ court }: { court: CourtItem }) {
  return (
    <div className="arena-court-features">
      {court.features.map((feature) => (
        <span key={feature}>
          <ArenaIcon name="check" />
          {feature}
        </span>
      ))}
    </div>
  );
}

function CourtDescription({ court }: { court: CourtItem }) {
  return (
    <div className="arena-court-description">
      <div className="arena-court-title-row">
        <h3>{court.name}</h3>
        <span className="arena-live">
          <i />
          {court.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm ngừng'}
        </span>
      </div>
      <p>
        <ArenaIcon name="layers" />
        Mặt sân: <strong>{court.surfaceType}</strong>
      </p>
      {court.address && (
        <p>
          <ArenaIcon name="pin" />
          <span>{court.address}</span>
        </p>
      )}
      <CourtFeatures court={court} />
    </div>
  );
}

export function ArenaCourtCard({ court }: { court: CourtItem }) {
  return (
    <article className="arena-court-card">
      <CourtMedia court={court} />
      <CourtDescription court={court} />
      <div className="arena-court-action">
        {COURT_DETAILS_ENABLED && court.status === 'ACTIVE' ? (
          <Link
            href={`/courts/${encodeURIComponent(court.id)}`}
            className="arena-button"
          >
            <span>Đặt sân này ngay</span>
            <ArenaIcon name="arrow" />
          </Link>
        ) : (
          <button type="button" className="arena-button" disabled>
            Tạm ngừng đặt sân
          </button>
        )}
      </div>
    </article>
  );
}
