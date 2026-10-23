'use client';

import { useState } from 'react';
import { useCourtCatalog } from '../../features/courts/hooks/use-court-catalog';
import { ArenaCourtTabs } from '../../features/courts/components/arena-court-switcher';
import { CourtInfoCard } from '../../features/courts/components/court-info-card';
import { ArenaBookingHeading } from './arena-booking-heading';
import { ArenaShell } from './arena-shell';
import { ArenaLoadStatus } from './arena-load-status';

export function ArenaBookingPage() {
  const catalog = useCourtCatalog();
  const [selectedId, setSelectedId] = useState('');
  const court =
    catalog.courts.find((item) => item.id === selectedId) ?? catalog.courts[0];
  return (
    <ArenaShell page="booking">
      <main className="arena-main booking-live arena-booking-page">
        <ArenaBookingHeading />
        <ArenaLoadStatus {...catalog} empty={!court} />
        <ArenaCourtTabs
          courts={catalog.courts}
          selectedId={court?.id ?? ''}
          onSelect={setSelectedId}
        />
        {court && <CourtInfoCard key={court.id} court={court} />}
      </main>
    </ArenaShell>
  );
}
