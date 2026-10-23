'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { SportyHeader } from '../home/sporty-header';
import { SportyFooter } from '../home/sporty-footer';
import { ArenaBackground } from './arena-background';

export type ArenaPage = 'home' | 'booking' | 'bookings' | 'court-detail';

export function ArenaShell({
  children,
  page = 'home',
}: {
  children: ReactNode;
  page?: ArenaPage;
}) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="arena-shell" data-motion={paused ? 'paused' : 'running'}>
      <ArenaBackground paused={paused} />
      <SportyHeader currentPage={page} />
      {children}
      <SportyFooter linkPrefix="/" />
      <button
        className="arena-motion-control"
        type="button"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused ? 'Bật animation' : 'Tạm dừng animation'}
      </button>
    </div>
  );
}
