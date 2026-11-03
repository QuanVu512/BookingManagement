'use client';

import type { ReactNode } from 'react';
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
  return (
    <div className="arena-shell editorial-grain">
      <ArenaBackground />
      <SportyHeader currentPage={page} />
      <aside className="arena-wide" aria-label="Thông báo bản demo">
        <p role="note">
          Hệ thống đặt sân thử nghiệm (Project Showcase) — Các thông tin sân bãi
          và giao dịch chỉ phục vụ mục đích trình diễn công nghệ.
        </p>
      </aside>
      {children}
      <SportyFooter linkPrefix="/" />
    </div>
  );
}
