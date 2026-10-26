import React from 'react';
import Link from 'next/link';
import { ArenaLogo } from '../arena/arena-logo';
import { ArenaLocationButton } from '../arena/arena-location';
import { CookiePreferencesTrigger } from '../../features/legal/components/cookie-preferences-trigger';

function FooterBrand() {
  return (
    <div className="arena-footer-brand">
      <span className="arena-logo">
        <ArenaLogo size={24} className="text-[#10e760]" />
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
        <FooterBrand />
        <nav aria-label="Điều hướng chân trang" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
          <Link href="/">Trang chủ</Link>
          <a href="/#facilities">Tiện ích</a>
          <Link href="/booking">Đặt sân</Link>
          <Link href="/bookings">Lịch của tôi</Link>
          <Link href="/support">Hỗ trợ</Link>
          <Link href="/privacy">Quyền riêng tư</Link>
          <Link href="/terms">Điều khoản</Link>
          <Link href="/cookies">Cookie</Link>
          <Link href="/refund-policy">Hoàn tiền</Link>
          <CookiePreferencesTrigger />
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
