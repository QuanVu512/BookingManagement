'use client';

import React, { useState } from 'react';

export function HeroSection() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0],
  );

  return (
    <section
      id="top"
      style={{
        position: 'relative',
        padding: '64px 0 52px',
        background:
          'radial-gradient(ellipse at 50% -20%, rgba(163, 230, 53, 0.12) 0%, rgba(7, 10, 17, 0) 70%)',
        borderBottom: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      <div className="container" style={{ position: 'relative', zIndex: 1 }}>
        {/* Top Tagline */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
        >
          <div
            className="badge badge-standard"
            style={{
              padding: '6px 16px',
              fontSize: '0.78rem',
              boxShadow: 'var(--shadow-glow)',
            }}
          >
            Sân Thể Thao Phù Đổng — Cầu Trạc, Hà Nội
          </div>
        </div>

        {/* Hero Title (Softened, elegant typography without screaming all-caps) */}
        <div
          style={{
            textAlign: 'center',
            maxWidth: '820px',
            margin: '0 auto 28px',
          }}
        >
          <h1
            style={{
              fontSize: 'clamp(2rem, 4.2vw, 3.2rem)',
              fontWeight: 700,
              lineHeight: 1.25,
              letterSpacing: '-0.02em',
              color: 'var(--text-primary)',
            }}
          >
            Chinh phục từng pha bóng cùng{' '}
            <span className="gradient-volt-text">sân Pickleball</span>
          </h1>
          <p
            style={{
              maxWidth: '680px',
              margin: '14px auto 0',
              color: 'var(--text-secondary)',
              fontSize: '1rem',
              lineHeight: 1.7,
            }}
          >
            Khám phá các sân Pickleball tại Phù Đổng, so sánh tiện ích và giá
            thuê, rồi chọn ngày phù hợp để xem lịch sân theo khung giờ.
          </p>
        </div>

        {/* Quick Search & Filter Card */}
        <div
          style={{
            maxWidth: '820px',
            margin: '0 auto',
            background: 'var(--bg-glass)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            boxShadow: 'var(--shadow-card)',
            backdropFilter: 'blur(20px)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)) auto',
              gap: '16px',
              alignItems: 'flex-end',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                }}
              >
                Ngày đặt sân
              </label>
              <input
                type="date"
                className="form-input"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ height: '48px' }}
              />
            </div>

            <div>
              <a
                href="#courts-catalog"
                className="btn btn-primary"
                style={{ height: '48px', padding: '0 28px' }}
              >
                Xem sân trống
              </a>
            </div>
          </div>
        </div>

        {/* Key Features row - Clean without parentheses, 10% cancellation rule */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '32px',
            marginTop: '36px',
            color: 'var(--text-secondary)',
            fontSize: '0.88rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-volt)', fontSize: '1.1rem' }}>
              ✓
            </span>
            <span>Lịch sân được hiển thị theo ngày</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-volt)', fontSize: '1.1rem' }}>
              ✓
            </span>
            <span>So sánh tiện ích và giá thuê</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-volt)', fontSize: '1.1rem' }}>
              ✓
            </span>
            <span>Chọn thêm nước uống và dụng cụ</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-volt)', fontSize: '1.1rem' }}>
              ✓
            </span>
            <span>Kiểm tra thông tin trước khi tiếp tục</span>
          </div>
        </div>
      </div>
    </section>
  );
}
