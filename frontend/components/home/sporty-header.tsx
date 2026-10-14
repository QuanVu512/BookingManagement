'use client';

import React, { useState, useEffect } from 'react';
import { useAuthActions, useAuthSession } from '../../context/auth-context';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '../theme/theme-toggle';

export function SportyHeader({
  currentPage = 'home',
}: {
  currentPage?: 'home' | 'court-detail';
}) {
  const {
    user,
    isAuthenticated,
    status,
    isLoading,
    sessionError,
    logoutError,
  } = useAuthSession();
  const { logout, openAuthModal, refreshSession } = useAuthActions();
  const router = useRouter();
  const isHomePage = currentPage === 'home';
  const [activeNav, setActiveNav] = useState<'courts' | 'facilities' | 'about'>(
    'courts',
  );

  useEffect(() => {
    if (!isHomePage) return;

    const handleScroll = () => {
      const scrollPos = window.scrollY + 200;
      const aboutEl = document.getElementById('about');
      const facilitiesEl = document.getElementById('facilities');
      const courtsEl = document.getElementById('courts-catalog');

      if (aboutEl && scrollPos >= aboutEl.offsetTop) {
        setActiveNav('about');
      } else if (facilitiesEl && scrollPos >= facilitiesEl.offsetTop) {
        setActiveNav('facilities');
      } else if (courtsEl && scrollPos >= courtsEl.offsetTop - 100) {
        setActiveNav('courts');
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isHomePage]);

  const scrollToSection = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
    navKey: 'courts' | 'facilities' | 'about',
  ) => {
    e.preventDefault();
    setActiveNav(navKey);
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'var(--bg-header)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top announcement bar */}
      <div
        style={{
          background:
            'linear-gradient(90deg, #14532d 0%, #166534 50%, #65a30d 100%)',
          color: '#f8fafc',
          fontSize: '0.78rem',
          fontWeight: 600,
          padding: '6px 0',
          textAlign: 'center',
          letterSpacing: '0.02em',
        }}
      >
        Khám phá sân Pickleball tại Phù Đổng — xem tiện ích, lịch sân và chọn
        khung giờ phù hợp với bạn.
      </div>

      <div
        className="container site-header-row"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '72px',
        }}
      >
        {/* Authentic Club Badge Logo */}
        <a
          className="site-header-brand"
          href={isHomePage ? '#top' : '/#top'}
          onClick={
            isHomePage ? (e) => scrollToSection(e, 'top', 'courts') : undefined
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid rgba(163, 230, 53, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
              flexShrink: 0,
            }}
          >
            {/* Custom SVG Sports Shield Crest */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2.5L4.5 6V11.5C4.5 16.5 7.7 21.1 12 22.2C16.3 21.1 19.5 16.5 19.5 11.5V6L12 2.5Z"
                fill="rgba(163, 230, 53, 0.12)"
                stroke="#a3e635"
                strokeWidth="1.6"
              />
              <path
                d="M9 12L11 14.2L15 9.8"
                stroke="#a3e635"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <div
              style={{
                fontWeight: 800,
                fontSize: '1.25rem',
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
                lineHeight: 1.15,
              }}
            >
              SMASH <span style={{ color: 'var(--accent-volt)' }}>ARENA</span>
            </div>
            <div
              style={{
                fontSize: '0.68rem',
                color: 'var(--text-secondary)',
                letterSpacing: '0.04em',
                marginTop: '2px',
              }}
            >
              CLB Thể Thao Phù Đổng
            </div>
          </div>
        </a>

        {/* Navigation Tabs with Active Light-Up Effect */}
        <nav
          className="site-header-nav"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <a
            href={isHomePage ? '#courts-catalog' : '/#courts-catalog'}
            onClick={
              isHomePage
                ? (e) => scrollToSection(e, 'courts-catalog', 'courts')
                : undefined
            }
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.9rem',
              fontWeight: 600,
              transition: 'all var(--transition-fast)',
              color:
                activeNav === 'courts'
                  ? 'var(--accent-volt)'
                  : 'var(--text-secondary)',
              background:
                activeNav === 'courts'
                  ? 'rgba(163, 230, 53, 0.12)'
                  : 'transparent',
              border:
                activeNav === 'courts'
                  ? '1px solid rgba(163, 230, 53, 0.4)'
                  : '1px solid transparent',
              boxShadow:
                activeNav === 'courts'
                  ? '0 0 16px rgba(163, 230, 53, 0.2)'
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>🏟️</span> Đặt Sân
          </a>

          <a
            href={isHomePage ? '#facilities' : '/#facilities'}
            onClick={
              isHomePage
                ? (e) => scrollToSection(e, 'facilities', 'facilities')
                : undefined
            }
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.9rem',
              fontWeight: 600,
              transition: 'all var(--transition-fast)',
              color:
                activeNav === 'facilities'
                  ? 'var(--accent-volt)'
                  : 'var(--text-secondary)',
              background:
                activeNav === 'facilities'
                  ? 'rgba(163, 230, 53, 0.12)'
                  : 'transparent',
              border:
                activeNav === 'facilities'
                  ? '1px solid rgba(163, 230, 53, 0.4)'
                  : '1px solid transparent',
              boxShadow:
                activeNav === 'facilities'
                  ? '0 0 16px rgba(163, 230, 53, 0.2)'
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>⚡</span> Tiện Ích & Dịch Vụ
          </a>

          <a
            href={isHomePage ? '#about' : '/#about'}
            onClick={
              isHomePage
                ? (e) => scrollToSection(e, 'about', 'about')
                : undefined
            }
            style={{
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.9rem',
              fontWeight: 600,
              transition: 'all var(--transition-fast)',
              color:
                activeNav === 'about'
                  ? 'var(--accent-volt)'
                  : 'var(--text-secondary)',
              background:
                activeNav === 'about'
                  ? 'rgba(163, 230, 53, 0.12)'
                  : 'transparent',
              border:
                activeNav === 'about'
                  ? '1px solid rgba(163, 230, 53, 0.4)'
                  : '1px solid transparent',
              boxShadow:
                activeNav === 'about'
                  ? '0 0 16px rgba(163, 230, 53, 0.2)'
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📍</span> Về Chúng Tôi
          </a>

          {/* Scale-up Sport Shop placeholder */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: 500,
              background: 'var(--bg-pill)',
              border: '1px dashed var(--border-subtle)',
              cursor: 'not-allowed',
              opacity: 0.75,
              marginLeft: '4px',
            }}
            title="Hệ thống bán phụ kiện thể thao chuẩn bị ra mắt"
          >
            <span>🛍️</span> Cửa Hàng
            <span
              style={{
                fontSize: '0.65rem',
                padding: '2px 6px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(163, 230, 53, 0.1)',
                color: 'var(--accent-volt)',
                fontWeight: 600,
              }}
            >
              Sắp ra mắt
            </span>
          </div>
        </nav>

        <ThemeToggle compact />

        {/* Auth CTA or User Menu */}
        <div
          className="site-header-account"
          style={{ display: 'flex', alignItems: 'center', gap: '12px' }}
        >
          {status === 'unknown' ? (
            <div>
              <p role="status">
                {isLoading ? 'Đang kiểm tra phiên...' : sessionError}
              </p>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                disabled={isLoading}
                onClick={() => void refreshSession()}
              >
                Thử lại phiên
              </button>
            </div>
          ) : isAuthenticated && user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {user.isStaffOrAdmin ? (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-volt"
                  onClick={() => router.push('/dashboard')}
                >
                  ⚙️ Vào Dashboard
                </button>
              ) : null}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--bg-pill)',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div
                  style={{
                    width: '26px',
                    height: '26px',
                    borderRadius: '50%',
                    background: 'var(--accent-lime)',
                    color: 'var(--text-dark)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                  }}
                >
                  {user.fullName.charAt(0).toUpperCase()}
                </div>
                <div
                  className="site-user-name"
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                  }}
                >
                  {user.fullName}
                </div>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => void logout().catch(() => undefined)}
                style={{ padding: '6px 12px', fontSize: '0.8rem' }}
              >
                Đăng Xuất
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => openAuthModal()}
            >
              Đăng nhập
            </button>
          )}
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      </div>
    </header>
  );
}
