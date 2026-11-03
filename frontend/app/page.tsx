'use client';

import { useState } from 'react';
import { useCourtCatalog } from '../features/courts/hooks/use-court-catalog';
import { ArenaShell } from '../components/arena/arena-shell';
import { HeroSection } from '../components/home/hero-section';
import { InstantBookingBar } from '../components/home/instant-booking-bar';
import { KineticTicker } from '../components/home/kinetic-ticker';
import { CourtCatalogView } from '../features/courts/components/court-catalog-view';
import { LiveScheduleMatrix } from '../components/home/live-schedule-matrix';
import { ProShopSection } from '../components/home/pro-shop-section';
import { ImageLightboxModal } from '../components/home/image-lightbox-modal';
import { GuestConfirmDialog } from '../components/auth/guest-confirm-dialog';

export default function HomePage() {
  const { courts, error, loading, retry } = useCourtCatalog();
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    src: string;
    title: string;
    caption: string;
  }>({
    isOpen: false,
    src: '',
    title: '',
    caption: '',
  });

  const openLightbox = (src: string, title: string, caption: string) => {
    setLightbox({ isOpen: true, src, title, caption });
  };

  const closeLightbox = () => {
    setLightbox((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <ArenaShell page="home">
      <main className="arena-home-main">
        {/* Asymmetric High-Fashion Editorial Hero Section */}
        <HeroSection courts={courts} onOpenLightbox={openLightbox} />

        {/* Floating Concierge / Instant Booking Bar */}
        <InstantBookingBar courts={courts} />

        {/* Kinetic Editorial Ticker Tape */}
        <KineticTicker />

        {/* Catalog Status Info (Loading / Error) */}
        {loading && (
          <div className="arena-wide py-4 text-center text-xs font-mono opacity-60" role="status">
            Đang tải dữ liệu từ máy chủ…
          </div>
        )}
        {error && (
          <div className="arena-wide py-4 text-center text-xs font-mono text-red-400" role="status">
            {error}{' '}
            <button className="underline ml-2 text-emeraldPro hover:opacity-80" onClick={retry}>
              Thử lại
            </button>
          </div>
        )}

        {/* Lookbook Court Cards */}
        <CourtCatalogView courts={courts} />

        {/* Live Interactive Schedule Matrix */}
        <LiveScheduleMatrix courts={courts} />

        {/* Pro Shop & Energy Bar Showcase */}
        <ProShopSection />
      </main>

      {/* Lightbox Modal for Full-Size Image Inspection */}
      <ImageLightboxModal
        isOpen={lightbox.isOpen}
        src={lightbox.src}
        title={lightbox.title}
        caption={lightbox.caption}
        onClose={closeLightbox}
      />

      <GuestConfirmDialog />
    </ArenaShell>
  );
}
