'use client';

import { useState } from 'react';
import { ArenaIcon } from '../arena/arena-icon';
import { ArenaLocationButton } from '../arena/arena-location';
import type { CourtItem } from '../../features/courts/model/court';
import { formatVnd } from '../../features/booking/model/booking-time';

interface HeroCourtData {
  id: string;
  name: string;
  badge: string;
  badgeType: 'vip' | 'standard';
  price: number;
  surface: string;
  image: string;
  tagline: string;
}

function HeroStats({ courts }: { courts?: CourtItem[] }) {
  const count = courts ? courts.length : 0;
  const vip = courts
    ? courts.filter((court) => court.courtType === 'VIP').length
    : 0;
  const standard = count - vip;

  const stats = [
    {
      prefix: '01 / ARENA CAPACITY',
      value: count > 0 ? `${count} SÂN ĐẤU` : 'HỆ THỐNG SÂN',
      label:
        count > 0
          ? `${vip} sân VIP · ${standard} sân tiêu chuẩn`
          : 'Dữ liệu từ máy chủ',
    },
    {
      prefix: '02 / REAL-TIME SYNC',
      value: 'LỊCH TRỰC TUYẾN',
      label: 'Kiểm tra khung giờ theo sân',
    },
    {
      prefix: '03 / DIRECT PRICING',
      value: 'GIÁ MINH BẠCH',
      label: 'Báo giá trực tiếp từ máy chủ',
    },
    {
      prefix: '04 / PLAYER PASS',
      value: 'LỊCH CỦA TÔI',
      label: 'Quản lý lượt đặt & thanh toán',
    },
  ];
  return (
    <div
      className="arena-hero-stats"
      role="region"
      aria-label="Thông số hệ thống"
    >
      {stats.map((stat) => (
        <div key={stat.prefix} className="arena-telemetry-pillar group">
          <span className="arena-pillar-num">{stat.prefix}</span>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HeroSection({
  courts,
  onOpenLightbox,
}: {
  courts?: CourtItem[];
  onOpenLightbox?: (src: string, title: string, caption: string) => void;
} = {}) {
  const [selectedCourtIndex, setSelectedCourtIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'photo' | 'overview'>('photo');

  const heroCourts: HeroCourtData[] =
    courts && courts.length > 0
      ? courts.map((c, idx) => ({
          id: c.id,
          name: c.name,
          badge: `${c.courtType === 'VIP' ? 'SÂN VIP' : 'TIÊU CHUẨN'} • ${c.code}`,
          badgeType: c.courtType === 'VIP' ? 'vip' : 'standard',
          price: c.pricePerHour,
          surface: c.surfaceType,
          image: c.imageUrl || `/courts/court-${(idx % 4) + 1}.jpg`,
          tagline: c.surfaceType ? `${c.name} • ${c.surfaceType}` : c.name,
        }))
      : [];

  const activeCourt = heroCourts[selectedCourtIndex] || heroCourts[0];

  const handlePhotoClick = () => {
    if (!onOpenLightbox) return;
    if (viewMode === 'overview') {
      onOpenLightbox(
        '/courts/court-overview-angle.jpg',
        'Toàn cảnh cụm 4 sân SMASH ARENA DEMO',
        'Góc chụp toàn cảnh từ trên cao: 4 sân đấu trong nhà, mái che cách nhiệt và đèn LED thi đấu.',
      );
    } else if (activeCourt) {
      onOpenLightbox(
        activeCourt.image,
        activeCourt.name,
        activeCourt.surface
          ? `${activeCourt.surface} • SMASH ARENA DEMO`
          : 'SMASH ARENA DEMO',
      );
    }
  };

  return (
    <section
      id="hero"
      className="relative hairline-b overflow-hidden"
      aria-labelledby="home-title"
    >
      {/* Subtle Ambient Architectural Spotlights */}
      <div className="pointer-events-none absolute -top-40 left-1/4 w-[650px] h-[650px] rounded-full bg-emeraldPro/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-20 right-10 w-[420px] h-[420px] rounded-full bg-volt/5 blur-[120px]" />

      <div className="max-w-[1440px] mx-auto grid grid-cols-1 lg:grid-cols-12">
        {/* LEFT COLUMN (7 Cols): Editorial Manifesto & Core Actions */}
        <div className="lg:col-span-7 px-4 sm:px-8 pt-10 pb-12 lg:py-16 lg:hairline-r flex flex-col justify-between relative">
          {/* Eyebrow badge */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div className="arena-hero-eyebrow">
              <span className="arena-ping-dot pulse-dot" />
              <span>SÂN ĐẤU & ĐẶT LỊCH TRỰC TUYẾN</span>
            </div>
          </div>

          {/* High-Fashion Oversized Display Typography */}
          <div className="my-auto">
            <p className="font-serif italic text-2xl sm:text-3xl text-emeraldPro mb-2 tracking-wide font-normal">
              The New Court Culture — Private & Pro Standard
            </p>
            <h1
              id="home-title"
              className="text-4xl sm:text-6xl xl:text-[68px] font-extrabold tracking-tight leading-[1.03] uppercase"
            >
              DỊCH VỤ <br />
              <span className="arena-shimmer text-transparent bg-clip-text bg-gradient-to-r from-emeraldPro via-volt to-emeraldPro">
                PICKLEBALL
              </span>
            </h1>

            {/* Core Action Buttons */}
            <div className="arena-hero-actions mt-8 flex flex-wrap items-center gap-3.5">
              <a
                href="/booking"
                className="arena-button arena-button-neon h-12 px-7 rounded-xl bg-emeraldPro hover:bg-volt text-obsidian font-extrabold text-xs sm:text-sm tracking-wider uppercase flex items-center gap-2.5 shadow-xl transition-all"
              >
                <ArenaIcon name="calendar" />
                <span>Đặt sân ngay</span>
              </a>

              <a
                href="/bookings"
                className="arena-button h-12 px-5 rounded-xl hairline-box bg-[var(--bg-secondary)] hover:border-emeraldPro text-xs sm:text-sm font-semibold flex items-center gap-2.5 transition-all"
              >
                <ArenaIcon name="qr" />
                <span>Lịch của tôi & vé sân</span>
              </a>

              <ArenaLocationButton label="Thông tin cơ sở demo" />
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 Cols): Stage */}
        <div className="lg:col-span-5 p-4 sm:p-8 flex flex-col justify-between bg-[var(--bg-secondary)]/50 relative">
          {heroCourts.length > 0 && activeCourt ? (
            <>
              {/* Top Stage Controls: Court Switcher Tabs */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono uppercase tracking-wider opacity-60">
                    CHỌN SÂN:
                  </span>
                  <div className="flex items-center gap-1 p-1 rounded-lg hairline-box bg-[var(--bg-primary)]">
                    {heroCourts.map((court, idx) => (
                      <button
                        key={court.id}
                        type="button"
                        onClick={() => setSelectedCourtIndex(idx)}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${
                          selectedCourtIndex === idx
                            ? court.badgeType === 'vip'
                              ? 'bg-vipGold text-obsidian shadow-sm'
                              : 'bg-emeraldPro text-obsidian shadow-sm'
                            : 'opacity-70 hover:opacity-100 text-[var(--text-primary)]'
                        }`}
                      >
                        {court.name
                          .replace('Demo Court ', '')
                          .replace('Center Court ', '')
                          .replace('Championship Arena ', '')
                          .replace('Pickle Standard ', '')
                          .replace('Dynamic Court ', '') || `#${idx + 1}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* View Mode Toggle: Ảnh thực tế / Toàn cảnh (Không có Blueprint) */}
                <div className="flex items-center gap-1 p-1 rounded-lg hairline-box bg-[var(--bg-primary)]">
                  <button
                    type="button"
                    onClick={() => setViewMode('photo')}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-all ${
                      viewMode === 'photo'
                        ? 'bg-emeraldPro text-obsidian font-bold'
                        : 'opacity-70 hover:opacity-100 text-[var(--text-primary)]'
                    }`}
                  >
                    Ảnh thực tế
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('overview')}
                    className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-all ${
                      viewMode === 'overview'
                        ? 'bg-emeraldPro text-obsidian font-bold'
                        : 'opacity-70 hover:opacity-100 text-[var(--text-primary)]'
                    }`}
                  >
                    Toàn cảnh
                  </button>
                </div>
              </div>

              {/* Interactive Stage Box */}
              <div className="relative rounded-2xl hairline-box bg-[#08100C] p-4 sm:p-5 overflow-hidden shadow-2xl">
                {/* Top Status Overlay */}
                <div className="flex items-center justify-between mb-3 relative z-10">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                        activeCourt.badgeType === 'vip'
                          ? 'bg-vipGold text-obsidian'
                          : 'bg-emeraldPro text-obsidian'
                      }`}
                    >
                      {activeCourt.badge}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emeraldPro/15 text-emeraldPro border border-emeraldPro/30">
                      ● Đang hoạt động
                    </span>
                  </div>
                  <span className="font-mono font-bold text-sm text-volt tabular-nums">
                    {formatVnd(activeCourt.price)} / Giờ
                  </span>
                </div>

                {/* Real Photography Display */}
                {viewMode === 'photo' && (
                  <div
                    className="relative rounded-xl overflow-hidden aspect-[16/10] bg-black/40 group cursor-pointer"
                    onClick={handlePhotoClick}
                  >
                    <img
                      src={activeCourt.image}
                      alt={activeCourt.name}
                      className="w-full h-full object-cover zoom-hover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

                    {/* Technical Watermark Overlays */}
                    <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-white/90">
                      <span className="text-emeraldPro">LIVE FEED</span> // CAM
                      0{selectedCourtIndex + 1} • INDOOR 11M
                    </div>
                    <div className="absolute top-3 right-3 px-2 py-1 rounded bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-volt">
                      ANTI-GLARE LED
                    </div>

                    {/* Hover Lightbox Hint */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                      <span className="px-4 py-2 rounded-xl bg-emeraldPro text-obsidian font-mono font-extrabold text-xs uppercase flex items-center gap-1.5 shadow-xl">
                        <ArenaIcon name="arrow" />
                        Xem ảnh phóng to
                      </span>
                    </div>

                    {/* Bottom Information Pill on Image */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white">
                      <span className="font-mono text-[11px] text-white/90 drop-shadow">
                        {activeCourt.tagline}
                      </span>
                      <span className="text-[10px] font-mono text-volt uppercase">
                        Độ nảy USAPA ✓
                      </span>
                    </div>
                  </div>
                )}

                {/* Aerial Overview Display */}
                {viewMode === 'overview' && (
                  <div
                    className="relative rounded-xl overflow-hidden aspect-[16/10] bg-black/40 group cursor-pointer"
                    onClick={handlePhotoClick}
                  >
                    <img
                      src="/courts/court-overview-angle.jpg"
                      alt="Toàn cảnh cụm 4 sân đấu SMASH ARENA"
                      className="w-full h-full object-cover zoom-hover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

                    {/* Court Pins on Overview */}
                    <div className="absolute top-[28%] left-[24%] px-2 py-0.5 rounded-full bg-vipGold text-obsidian font-mono font-bold text-[9px] shadow-lg animate-bounce">
                      PRO 1
                    </div>
                    <div className="absolute top-[28%] right-[32%] px-2 py-0.5 rounded-full bg-vipGold text-obsidian font-mono font-bold text-[9px] shadow-lg">
                      PRO 2
                    </div>
                    <div className="absolute bottom-[35%] left-[28%] px-2 py-0.5 rounded-full bg-emeraldPro text-obsidian font-mono font-bold text-[9px] shadow-lg">
                      STD 3
                    </div>
                    <div className="absolute bottom-[35%] right-[28%] px-2 py-0.5 rounded-full bg-emeraldPro text-obsidian font-mono font-bold text-[9px] shadow-lg">
                      STD 4
                    </div>

                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs text-white">
                      <span className="font-mono text-[11px] text-white/90">
                        Góc toàn cảnh cụm 4 sân trong nhà tiêu chuẩn
                      </span>
                      <span className="text-[10px] font-mono text-emeraldPro">
                        4 COURTS TOTAL
                      </span>
                    </div>
                  </div>
                )}

                {/* Selected Court Info Footer inside Stage */}
                <div className="mt-3 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-white">
                  <div>
                    <h3 className="font-bold text-base tracking-tight text-white">
                      {activeCourt.name}
                    </h3>
                    {activeCourt.surface && (
                      <p className="text-xs text-white/65">
                        Mặt sân: {activeCourt.surface}
                      </p>
                    )}
                  </div>
                  <a
                    href={`/booking?courtId=${encodeURIComponent(activeCourt.id)}`}
                    className="px-4 py-2 rounded-lg bg-volt text-obsidian font-mono font-bold text-xs uppercase hover:bg-emeraldPro transition-all flex items-center gap-1.5"
                  >
                    <span>Đặt sân này</span>
                    <span>→</span>
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="relative rounded-2xl hairline-box bg-[#08100C] p-8 overflow-hidden shadow-2xl flex flex-col items-center justify-center min-h-[320px] text-center my-auto">
              <div className="w-12 h-12 rounded-xl border border-emeraldPro/30 bg-emeraldPro/10 flex items-center justify-center mb-3 text-emeraldPro">
                <ArenaIcon name="calendar" />
              </div>
              <h3 className="font-extrabold text-sm uppercase text-[var(--text-primary)]">
                Chưa có dữ liệu từ backend
              </h3>
              <p className="text-xs font-mono text-[var(--text-secondary)] mt-1.5 max-w-xs">
                Vui lòng bật backend để tải danh sách sân đấu từ cơ sở dữ liệu.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Architectural Telemetry Strip (4 Stat Pillars) */}
      <div className="hairline-t">
        <HeroStats courts={courts} />
      </div>
    </section>
  );
}
