'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { CourtItem } from '../model/court';
import { COURT_DETAILS_ENABLED } from '../../../constants/features';
import { ArenaIcon } from '../../../components/arena/arena-icon';
import {
  DEFAULT_BOOKING_TIMEZONE,
  formatVnd,
  getNowInTimezone,
  isSlotInPast,
} from '../../booking/model/booking-time';

const QUICK_SLOT_HOURS = [16, 17, 18, 19, 20, 21];

function CourtMedia({ court }: { court: CourtItem }) {
  return (
    <div className="arena-court-media relative h-72 bg-[#070F0C] overflow-hidden hairline-b">
      <Image
        src={court.imageUrl || '/courts/court-1.jpg'}
        alt={court.name}
        fill
        sizes="(max-width: 767px) 100vw, 600px"
        className="arena-court-image object-cover zoom-hover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

      {/* Badges */}
      <CourtBadges court={court} />

      {/* Floating Price Tag */}
      <span className="arena-court-rate absolute bottom-4 right-4 px-3.5 py-2 rounded-xl bg-black/85 border border-emeraldPro/40 backdrop-blur-md text-right shadow-lg z-10">
        <span className="font-mono font-extrabold text-sm text-volt block tabular-nums">
          {court.pricePerHour > 0
            ? `${formatVnd(court.pricePerHour)} / Giờ`
            : 'Chưa có giá'}
        </span>
        <small className="font-mono text-[10px] text-white/60 block">
          Giá tham khảo
        </small>
      </span>
    </div>
  );
}

function CourtBadges({ court }: { court: CourtItem }) {
  return (
    <div className="arena-court-badges absolute top-4 left-4 flex items-center gap-2 z-10">
      <span
        className={
          court.courtType === 'VIP'
            ? 'arena-badge arena-badge-vip px-3 py-1 rounded-md text-[11px] font-mono font-extrabold uppercase tracking-wider bg-vipGold text-obsidian shadow-md'
            : 'arena-badge px-3 py-1 rounded-md text-[11px] font-mono font-extrabold uppercase tracking-wider bg-emeraldPro text-obsidian shadow-md'
        }
      >
        {court.courtType === 'VIP' ? 'SÂN VIP' : 'TIÊU CHUẨN'}
      </span>
      <span className="arena-code px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-black/75 text-white border border-white/15 backdrop-blur-md">
        {court.code}
      </span>
    </div>
  );
}

function CourtFeatures({ court }: { court: CourtItem }) {
  const visibleFeatures = (court.features ?? []).filter(
    (feature) => feature !== 'Vệ sinh theo yêu cầu',
  );
  if (visibleFeatures.length === 0) return null;
  return (
    <div className="arena-court-features mt-3 flex flex-wrap gap-2">
      {visibleFeatures.map((feature) => (
        <span
          key={feature}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-[var(--bg-primary)] hairline-box text-[var(--text-secondary)]"
        >
          <ArenaIcon name="check" />
          <span>{feature}</span>
        </span>
      ))}
    </div>
  );
}

function CourtDescription({ court }: { court: CourtItem }) {
  const timezone = court.timezone || DEFAULT_BOOKING_TIMEZONE;
  const todayDate = getNowInTimezone(timezone).date;
  const showSurface =
    Boolean(court.surfaceType) &&
    court.surfaceType !== 'Sân Pickleball trong nhà Cushion Pro';
  return (
    <div className="arena-court-description p-6 flex-1 flex flex-col justify-between space-y-4">
      <div>
        <div className="arena-court-title-row flex items-center justify-between gap-2">
          <h3 className="text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
            {court.name}
          </h3>
          <span className="arena-live inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-emeraldPro/15 text-emeraldPro border border-emeraldPro/30">
            <i className="w-1.5 h-1.5 rounded-full bg-emeraldPro" />
            <span>
              {court.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm ngừng'}
            </span>
          </span>
        </div>

        <div className="mt-3 space-y-1.5 text-xs sm:text-sm">
          {showSurface && (
            <p className="flex items-center gap-2 text-[var(--text-secondary)]">
              <ArenaIcon name="layers" />
              <span>Mặt sân:</span>
              <strong className="font-semibold text-[var(--text-primary)]">
                {court.surfaceType}
              </strong>
            </p>
          )}
          {court.address && (
            <p className="flex items-center gap-2 text-[var(--text-secondary)]">
              <ArenaIcon name="pin" />
              <span>{court.address}</span>
            </p>
          )}
        </div>

        <CourtFeatures court={court} />
      </div>

      {/* Quick Slot Selector */}
      <div className="pt-4 hairline-t">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-mono uppercase tracking-wider opacity-60">
            CHỌN NHANH CA TRỐNG HÔM NAY:
          </span>
          <span className="text-[10px] font-mono text-emeraldPro">
            Nhấn giờ để đặt
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_SLOT_HOURS.map((hour) => {
            const timeLabel = `${String(hour).padStart(2, '0')}:00`;
            const available =
              court.status === 'ACTIVE' &&
              !isSlotInPast(todayDate, hour, timezone);
            return available ? (
              <Link
                key={timeLabel}
                href={`/booking?courtId=${encodeURIComponent(court.id)}&slot=${encodeURIComponent(timeLabel)}`}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono hairline-box bg-[var(--bg-primary)] hover:border-emeraldPro hover:text-emeraldPro transition-all text-center"
              >
                {timeLabel}
              </Link>
            ) : (
              <span
                key={timeLabel}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-mono hairline-box opacity-35 line-through cursor-not-allowed text-center"
              >
                {timeLabel}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function ArenaCourtCard({ court }: { court: CourtItem }) {
  return (
    <article className="arena-court-card lookbook-card rounded-2xl hairline-box bg-[var(--bg-secondary)] overflow-hidden flex flex-col justify-between group hover:border-emeraldPro/60 transition-all duration-300 shadow-xl">
      <CourtMedia court={court} />
      <CourtDescription court={court} />
      <div className="arena-court-action p-6 pt-0">
        {COURT_DETAILS_ENABLED && court.status === 'ACTIVE' ? (
          <Link
            href={`/courts/${encodeURIComponent(court.id)}`}
            className="arena-button w-full py-3.5 rounded-xl hairline-box bg-[var(--bg-primary)] hover:bg-emeraldPro hover:text-obsidian hover:border-emeraldPro font-extrabold text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
          >
            <span>Đặt sân này ngay</span>
            <ArenaIcon name="arrow" />
          </Link>
        ) : (
          <button
            type="button"
            className="arena-button w-full py-3.5 rounded-xl opacity-50 cursor-not-allowed"
            disabled
          >
            Tạm ngừng đặt sân
          </button>
        )}
      </div>
    </article>
  );
}
