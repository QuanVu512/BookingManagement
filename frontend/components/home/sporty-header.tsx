'use client';

import { useState } from 'react';
import { useAuthSession } from '../../context/auth-context';
import { HeaderSession } from './header-session';
import { ArenaIcon, type ArenaIconName } from '../arena/arena-icon';
import { ArenaLogo } from '../arena/arena-logo';
import { ArenaLocationButton } from '../arena/arena-location';
import type { ArenaPage } from '../arena/arena-shell';

const LINKS: {
  page?: ArenaPage;
  href: string;
  label: string;
  icon: ArenaIconName;
}[] = [
  { page: 'home', href: '/', label: 'Trang chủ', icon: 'home' },
  { href: '/#facilities', label: 'Tiện ích', icon: 'layers' },
  { page: 'booking', href: '/booking', label: 'Đặt sân', icon: 'calendar' },
  {
    page: 'bookings',
    href: '/bookings',
    label: 'Lịch của tôi',
    icon: 'ticket',
  },
];

function Brand() {
  return (
    <a className="arena-brand" href="/" aria-label="SMASH ARENA — Trang chủ">
      <span className="arena-logo">
        <ArenaLogo size={26} className="text-[#10e760]" />
      </span>
      <span>
        <strong>SMASH ARENA</strong>
        <small>Pickleball Club</small>
      </span>
    </a>
  );
}

function MainNavigation({ page }: { page: ArenaPage }) {
  return (
    <nav className="arena-navigation" aria-label="Điều hướng chính">
      {LINKS.map((link) => (
        <a
          key={link.label}
          href={link.href}
          aria-current={
            link.page && (
              page === link.page ||
              (page === 'court-detail' && link.page === 'booking')
            )
              ? 'page'
              : undefined
          }
        >
          <ArenaIcon name={link.icon} />
          {link.label}
        </a>
      ))}
    </nav>
  );
}

function Announcement() {
  return (
    <div className="arena-announcement">
      <div className="arena-wide">
        <span>
          <i className="arena-pulse-dot" />
          SMASH ARENA · Hệ thống đặt sân Pickleball
        </span>
        <span className="arena-announcement-center">
          <b>ĐẶT LỊCH TRỰC TUYẾN</b>
          <span>Chọn sân, kiểm tra lịch & quản lý lượt chơi</span>
        </span>
        <ArenaLocationButton label="Vị trí cụm sân" />
      </div>
    </div>
  );
}

export function SportyHeader({
  currentPage = 'home',
}: {
  currentPage?: ArenaPage;
}) {
  const session = useAuthSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const actions = { session, menuOpen, onToggle: () => setMenuOpen(!menuOpen) };
  return (
    <>
      <Announcement />
      <header className="arena-header">
        <div className="arena-header-bar arena-wide">
          <Brand />
          <MainNavigation page={currentPage} />
          <HeaderActions {...actions} />
        </div>
        {menuOpen && (
          <div id="arena-mobile-menu" className="arena-mobile-menu">
            <MainNavigation page={currentPage} />
          </div>
        )}
      </header>
    </>
  );
}

function HeaderActions({
  menuOpen,
  onToggle,
  session,
}: {
  menuOpen: boolean;
  onToggle: () => void;
  session: ReturnType<typeof useAuthSession>;
}) {
  return (
    <div className="arena-header-actions">
      <a
        className="arena-button arena-button-neon arena-quick-book"
        href="/booking"
      >
        <ArenaIcon name="plus" />
        Đặt sân nhanh
      </a>
      <HeaderSession session={session} />
      <MobileMenuButton open={menuOpen} onToggle={onToggle} />
    </div>
  );
}

function MobileMenuButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className="arena-icon-button arena-mobile-toggle"
      type="button"
      aria-label={open ? 'Đóng menu' : 'Mở menu'}
      aria-expanded={open}
      aria-controls="arena-mobile-menu"
      onClick={onToggle}
    >
      <ArenaIcon name={open ? 'close' : 'menu'} width="20" height="20" />
    </button>
  );
}
