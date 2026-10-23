'use client';

import { useMemo, useState } from 'react';
import type { CourtItem } from '../model/court';
import { ArenaCourtCard } from './arena-court-card';

type CourtFilter = 'ALL' | 'VIP' | 'STANDARD';

function catalogTabs(
  courts: CourtItem[],
): { id: CourtFilter; label: string }[] {
  return [
    { id: 'ALL', label: `Tất cả sân (${courts.length})` },
    {
      id: 'VIP',
      label: `Sân VIP (${courts.filter((court) => court.courtType === 'VIP').length})`,
    },
    {
      id: 'STANDARD',
      label: `Sân tiêu chuẩn (${courts.filter((court) => court.courtType === 'STANDARD').length})`,
    },
  ];
}

function CatalogFilters({
  courts,
  filter,
  onChange,
}: {
  courts: CourtItem[];
  filter: CourtFilter;
  onChange: (filter: CourtFilter) => void;
}) {
  const tabs = catalogTabs(courts);
  return (
    <div
      className="arena-filter-tabs"
      role="group"
      aria-label="Lọc theo loại sân"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          aria-pressed={filter === tab.id}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CourtCatalogView({
  courts,
  query = '',
}: {
  courts: CourtItem[];
  query?: string;
}) {
  const [filter, setFilter] = useState<CourtFilter>('ALL');
  const visibleCourts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return courts.filter(
      (court) =>
        (filter === 'ALL' || court.courtType === filter) &&
        [court.name, court.code, court.surfaceType]
          .join(' ')
          .toLowerCase()
          .includes(needle),
    );
  }, [courts, filter, query]);
  return (
    <section id="courts-catalog" className="arena-catalog arena-wide">
      <div className="arena-section-heading">
        <div>
          <h2>
            DANH SÁCH SÂN ĐẤU <span className="arena-live">Danh mục sân</span>
          </h2>
          <p>Khám phá thông số chi tiết và giữ chỗ ngay cho trận đấu của bạn</p>
        </div>
        <CatalogFilters courts={courts} filter={filter} onChange={setFilter} />
      </div>
      <CatalogCards courts={visibleCourts} />
    </section>
  );
}

function CatalogCards({ courts }: { courts: CourtItem[] }) {
  if (!courts.length)
    return (
      <p className="arena-empty" role="status">
        Không có sân phù hợp với bộ lọc hiện tại.
      </p>
    );
  return (
    <div className="arena-court-grid">
      {courts.map((court) => (
        <ArenaCourtCard key={court.id} court={court} />
      ))}
    </div>
  );
}
