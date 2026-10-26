import { ArenaIcon } from '../arena/arena-icon';
import { ArenaLocationButton } from '../arena/arena-location';
import type { CourtItem } from '../../features/courts/model/court';

function HeroStats({ courts }: { courts?: CourtItem[] }) {
  const vip = courts?.filter((court) => court.courtType === 'VIP').length;
  const stats = [
    {
      value: courts ? `${courts.length} SÂN ĐẤU` : 'SÂN ĐẤU',
      label: courts
        ? `${vip} sân VIP · ${courts.length - (vip ?? 0)} sân tiêu chuẩn`
        : 'Danh mục từ hệ thống',
    },
    { value: 'LỊCH TRỰC TUYẾN', label: 'Kiểm tra khung giờ theo sân' },
    { value: 'GIÁ MINH BẠCH', label: 'Báo giá trực tiếp từ máy chủ' },
    { value: 'LỊCH CỦA TÔI', label: 'Quản lý lượt đặt & thanh toán' },
  ];
  return (
    <div className="arena-hero-stats">
      {stats.map((stat) => (
        <div key={stat.value}>
          <strong>{stat.value}</strong>
          <span>{stat.label}</span>
        </div>
      ))}
    </div>
  );
}

export function HeroSection({ courts }: { courts?: CourtItem[] } = {}) {
  return (
    <section id="top" className="arena-hero" aria-labelledby="home-title">
      <div className="arena-hero-eyebrow">
        <span className="arena-ping-dot" />
        SÂN ĐẤU & ĐẶT LỊCH TRỰC TUYẾN
      </div>
      <h1 id="home-title">
        DỊCH VỤ <span className="arena-shimmer">PICKLEBALL</span>
      </h1>
      <p className="arena-hero-description">
        Sân thể thao hiện đại & đặt lịch trực tuyến nhanh chóng. Khám phá sân phù hợp, kiểm tra
        khung giờ và chuẩn bị cho trận đấu của bạn tại SMASH ARENA.
      </p>
      <div className="arena-hero-actions">
        <a href="/booking" className="arena-button arena-button-neon">
          <ArenaIcon name="calendar" />
          Đặt sân ngay
        </a>
        <a href="/bookings" className="arena-button">
          <ArenaIcon name="qr" />
          Lịch của tôi & vé sân
        </a>
        <ArenaLocationButton />
      </div>
      <HeroStats courts={courts} />
    </section>
  );
}
