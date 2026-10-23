import { ArenaLogo } from '../arena/arena-logo';
import { ArenaLocationButton } from '../arena/arena-location';

function FooterBrand() {
  return (
    <div className="arena-footer-brand">
      <span className="arena-logo">
        <ArenaLogo size={24} className="text-[#10e760]" />
      </span>
      <div>
        <strong>SMASH ARENA PICKLEBALL</strong>
        <small>
          Hệ thống đặt sân & tổ chức giải đấu thể thao chuyên nghiệp
        </small>
      </div>
    </div>
  );
}

export function SportyFooter({
  linkPrefix: _linkPrefix = '',
}: {
  linkPrefix?: string;
}) {
  return (
    <footer className="arena-footer" id="about">
      <div className="arena-wide">
        <FooterBrand />
        <nav aria-label="Điều hướng chân trang">
          <a href="/">Trang chủ</a>
          <a href="/#facilities">Tiện ích</a>
          <a href="/booking">Đặt sân</a>
          <a href="/bookings">Lịch của tôi</a>
          <ArenaLocationButton label="Vị trí cụm sân" />
        </nav>
        <p>
          © 2026 SMASH ARENA.
          <br />
          Sân đấu & đặt lịch trực tuyến.
        </p>
      </div>
    </footer>
  );
}
