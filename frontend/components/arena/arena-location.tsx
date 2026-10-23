'use client';

import { useCallback, useState } from 'react';
import { useCourtCatalog } from '../../features/courts/hooks/use-court-catalog';
import { ArenaDialog } from './arena-dialog';
import { ArenaIcon } from './arena-icon';
import { ArenaLoadStatus } from './arena-load-status';

const MAPS_SEARCH = 'https://maps.app.goo.gl/vcBBnUFubbUFS67R7';

function VenueLocations() {
  const catalog = useCourtCatalog();
  const venues = [
    ...new Set(
      catalog.courts
        .map((court) =>
          [court.branchName, court.address].filter(Boolean).join(' · '),
        )
        .filter(Boolean),
    ),
  ];
  return (
    <div className="arena-location-content">
      <div className="arena-map-preview">
        <ArenaIcon name="pin" width="40" height="40" />
        <strong>SMASH ARENA</strong>
        <span>Chọn cơ sở để mở chỉ đường</span>
      </div>
      <ArenaLoadStatus {...catalog} empty={!venues.length} />
      {venues.map((venue) => (
        <VenueLink key={venue} venue={venue} />
      ))}
    </div>
  );
}

function VenueLink({ venue }: { venue: string }) {
  return (
    <a
      className="arena-venue-link"
      href={MAPS_SEARCH}
      target="_blank"
      rel="noopener noreferrer"
    >
      <ArenaIcon name="pin" />
      <span>{venue}</span>
      <ArenaIcon name="arrow" />
    </a>
  );
}

export function ArenaLocationButton({
  label = 'Chỉ đường tới sân',
}: {
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button
        type="button"
        className="arena-button arena-location-trigger"
        onClick={() => setOpen(true)}
      >
        <ArenaIcon name="pin" />
        {label}
      </button>
      {open && (
        <ArenaDialog title="Vị trí & chỉ đường SMASH ARENA" onClose={close}>
          <VenueLocations />
        </ArenaDialog>
      )}
    </>
  );
}
