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
    <section id="courts-section" className="arena-catalog arena-wide py-16 sm:py-24 hairline-b">
      <div className="arena-section-heading flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-10 hairline-b">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-emeraldPro/15 text-emeraldPro border border-emeraldPro/30">
              Danh mục sân
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-4">
            <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight uppercase">
              DANH SÁCH SÂN ĐẤU
            </h2>
            <span className="font-serif italic text-2xl text-emeraldPro hidden sm:inline">
              The Four Signatures
            </span>
          </div>
        </div>
        <CatalogFilters courts={courts} filter={filter} onChange={setFilter} />
      </div>
      <div className="mt-10">
        <CatalogCards courts={visibleCourts} />
      </div>
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
