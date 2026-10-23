'use client';

import { useCourtCatalog } from '../features/courts/hooks/use-court-catalog';
import { HeroSection } from '../components/home/hero-section';
import { CourtCatalogView } from '../features/courts/components/court-catalog-view';
import { FacilitiesSection } from '../components/home/facilities-section';
import { GuestConfirmDialog } from '../components/auth/guest-confirm-dialog';
import { ArenaShell } from '../components/arena/arena-shell';

export default function HomePage() {
  const { courts, error, loading, retry } = useCourtCatalog();
  return (
    <ArenaShell>
      <main className="arena-home-main">
        <HeroSection courts={loading || error ? undefined : courts} />
        <div className="arena-wide arena-catalog-status" role="status">
          {loading && <p>Đang tải danh mục sân…</p>}
          {error && (
            <p>
              {error}{' '}
              <button className="arena-button" onClick={retry}>
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
      </main>
      <GuestConfirmDialog />
    </ArenaShell>
  );
}
