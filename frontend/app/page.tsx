'use client';

import React, { useState, useEffect } from 'react';
import type { CourtItem } from '../types/auth';
import { FALLBACK_COURTS } from '../data/courts';
import { SportyHeader } from '../components/home/sporty-header';
import { HeroSection } from '../components/home/hero-section';
import { CourtCatalog } from '../components/home/court-catalog';
import { ScaleupStorePreview } from '../components/home/scaleup-store-preview';
import { FacilitiesSection } from '../components/home/facilities-section';
import { SportyFooter } from '../components/home/sporty-footer';
import { AuthModal } from '../components/auth/auth-modal';
import { GuestConfirmDialog } from '../components/auth/guest-confirm-dialog';
import { loadCourtCatalog } from '../services/courts';

export default function HomePage() {
  const [allCourts, setAllCourts] = useState<CourtItem[]>(FALLBACK_COURTS);

  // Fetch courts from backend if available
  useEffect(() => {
    const controller = new AbortController();
    loadCourtCatalog(controller.signal)
      .then((courts) => {
        if (!controller.signal.aborted) setAllCourts(courts);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          console.info('Danh mục sân đang dùng dữ liệu dự phòng.');
      });
    return () => controller.abort();
  }, []);

  return (
    <div
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <SportyHeader />

      <main style={{ flex: 1 }}>
        <HeroSection />
        <CourtCatalog courts={allCourts} />
        <FacilitiesSection />
        <ScaleupStorePreview />
      </main>

      <SportyFooter />

      {/* Auth Modal Popup */}
      <AuthModal />

      {/* Guest Confirmation Dialog */}
      <GuestConfirmDialog />
    </div>
  );
}
