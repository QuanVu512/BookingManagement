import React from 'react';
import Link from 'next/link';
import { ArenaLogo } from '../arena/arena-logo';
import { ArenaLocationButton } from '../arena/arena-location';
import { CookiePreferencesTrigger } from '../../features/legal/components/cookie-preferences-trigger';

function FooterBrand() {
  return (
    <div className="arena-footer-brand">
      <span className="arena-logo">
        <ArenaLogo size={28} className="text-[#10e760]" />
      </span>
      <div>
        <strong>SMASH ARENA PICKLEBALL</strong>
        <small>
          Hệ thống đặt sân & quản lý lịch thi đấu thể thao trực tuyến
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
    <footer className="arena-footer" id="about" aria-label="Chân trang hệ thống">
      <div className="arena-wide">
        <div className="arena-footer-main">
          <div className="arena-footer-brand-col">
            <FooterBrand />
            <p className="arena-footer-brand-desc">
              Hệ thống đặt sân thể thao chuyên nghiệp, hỗ trợ giữ chỗ linh hoạt, thi đấu giao lưu và cập nhật lịch trình nhanh chóng.
            </p>
          </div>

          <nav aria-label="Điều hướng chân trang" className="arena-footer-nav-grid">
            <div className="arena-footer-col">
              <h4 className="arena-footer-col-title">Dịch vụ</h4>
              <ul className="arena-footer-col-links">
                <li><Link href="/">Trang chủ</Link></li>
                <li><a href="/#facilities">Tiện ích</a></li>
                <li><Link href="/booking">Đặt sân</Link></li>
              </ul>
            </div>

            <div className="arena-footer-col">
              <h4 className="arena-footer-col-title">Hỗ trợ</h4>
              <ul className="arena-footer-col-links">
                <li><Link href="/bookings">Lịch của tôi</Link></li>
                <li><Link href="/support">Hỗ trợ</Link></li>
                <li><ArenaLocationButton label="Vị trí cụm sân" /></li>
              </ul>
            </div>

            <div className="arena-footer-col">
              <h4 className="arena-footer-col-title">Chính sách</h4>
              <ul className="arena-footer-col-links">
                <li><Link href="/privacy">Quyền riêng tư</Link></li>
                <li><Link href="/terms">Điều khoản</Link></li>
                <li><Link href="/refund-policy">Hoàn tiền</Link></li>
              </ul>
            </div>

            <div className="arena-footer-col">
              <h4 className="arena-footer-col-title">Cookie & Pháp lý</h4>
              <ul className="arena-footer-col-links">
                <li><Link href="/cookies">Cookie</Link></li>
                <li><CookiePreferencesTrigger /></li>
              </ul>
            </div>
          </nav>
        </div>

        <div className="arena-footer-bottom">
          <p className="arena-footer-copyright">
            © 2026 SMASH ARENA. Sân đấu & đặt lịch trực tuyến.
          </p>
          <span className="arena-footer-note">
            Bảo lưu mọi quyền.
          </span>
        </div>
      </div>
    </footer>
  );
}
