'use client';

import React from 'react';
import { useCourtCatalog } from '../features/courts/hooks/use-court-catalog';
import { SportyHeader } from '../components/home/sporty-header';
import { HeroSection } from '../components/home/hero-section';
import { CourtCatalogView } from '../features/courts/components/court-catalog-view';
import { ScaleupStorePreview } from '../components/home/scaleup-store-preview';
import { FacilitiesSection } from '../components/home/facilities-section';
import { SportyFooter } from '../components/home/sporty-footer';
import { AuthModal } from '../components/auth/auth-modal';
import { GuestConfirmDialog } from '../components/auth/guest-confirm-dialog';

export default function HomePage() {
  const { courts, error, loading, retry } = useCourtCatalog();

  return (
    <div
      style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}
    >
      <SportyHeader />

      <main style={{ flex: 1 }}>
        <HeroSection />
        <div className="container" role="status">
          {loading && <p>Đang tải danh mục sân…</p>}
          {error && (
            <p>
              {error}{' '}
              <button className="btn btn-secondary" onClick={retry}>
                Thử lại
              </button>
            </p>
          )}
          {!loading && !error && courts.length === 0 && (
            <p>Chưa có sân đang hoạt động.</p>
          )}
        </div>
        <CourtCatalogView courts={courts} />
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
