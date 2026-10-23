'use client';

import Link from 'next/link';
import type { CourtItem } from '../model/court';
import { useCourtCatalog } from '../hooks/use-court-catalog';

export function ArenaCourtTabs({
  courts,
  selectedId,
  onSelect,
}: {
  courts: CourtItem[];
  selectedId: string;
  onSelect?: (id: string) => void;
}) {
  return (
    <nav className="arena-court-tabs" aria-label="Chọn sân đấu">
      {courts.map((court) =>
        onSelect ? (
          <button
            type="button"
            key={court.id}
            aria-pressed={selectedId === court.id}
            onClick={() => onSelect(court.id)}
          >
            {court.code}
          </button>
        ) : (
          <Link
            key={court.id}
            href={`/courts/${encodeURIComponent(court.id)}`}
            aria-current={selectedId === court.id ? 'page' : undefined}
          >
            {court.code}
          </Link>
        ),
      )}
    </nav>
  );
}

export function ArenaCourtSwitcher({ selectedId }: { selectedId: string }) {
  const { courts } = useCourtCatalog();
  return <ArenaCourtTabs courts={courts} selectedId={selectedId} />;
}
