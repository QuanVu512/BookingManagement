'use client';

import React from 'react';

export function ScaleupStorePreview() {
  const futureCategories = [
    {
      title: 'Vợt Thi Đấu Carbon T700',
      subtitle: 'Chuẩn USA Pickleball Approved',
      status: 'Coming Soon',
      tag: 'Thiết Bị',
      icon: '🏓',
      image:
        'https://images.unsplash.com/photo-1599474924187-334a4ae5bd3c?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Bóng Thi Đấu 40 Lỗ Ngoài Trời',
      subtitle: 'Độ nảy chuẩn xác, độ bền cao',
      status: 'Coming Soon',
      tag: 'Phụ Kiện',
      icon: '🎾',
      image:
        'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?auto=format&fit=crop&w=800&q=80',
    },
    {
      title: 'Trang Phục Thể Thao Pro Aero',
      subtitle: 'Chất liệu thoáng khí, co giãn 4 chiều',
      status: 'Coming Soon',
      tag: 'Thời Trang',
      icon: '👕',
      image:
        'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=800&q=80',
    },
  ];

  return (
    <section
      id="store-preview"
      style={{
        padding: '64px 0',
        backgroundColor: 'var(--bg-primary)',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      <div className="container">
        <div
          style={{
            textAlign: 'center',
            maxWidth: '720px',
            margin: '0 auto 36px',
          }}
        >
          <div className="badge badge-standard" style={{ marginBottom: '8px' }}>
            Kế hoạch mở rộng
          </div>
          <h2
            style={{
              fontSize: 'clamp(1.7rem, 3.2vw, 2.2rem)',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Chuẩn Bị Ra Mắt:{' '}
            <span className="gradient-volt-text">Cửa Hàng Thể Thao</span>
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginTop: '8px',
              fontSize: '0.92rem',
            }}
          >
            Khu cửa hàng sẽ giới thiệu các lựa chọn phục vụ buổi chơi
            Pickleball: vợt thi đấu, bóng ngoài trời và trang phục vận động.
            Danh mục hiện đang được chuẩn bị; chưa mở đặt mua.
          </p>
        </div>

        {/* Catalog preview cards (No buy buttons as instructed, ready for scale-up) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '24px',
          }}
        >
          {futureCategories.map((item, idx) => (
            <div
              key={idx}
              style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden',
                position: 'relative',
                boxShadow: 'var(--shadow-card)',
                opacity: 0.9,
              }}
            >
              <div
                style={{
                  height: '180px',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                <img
                  src={item.image}
                  alt={item.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    filter: 'brightness(0.75)',
                  }}
                />
                <div
                  style={{ position: 'absolute', top: '12px', right: '12px' }}
                >
                  <span
                    style={{
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(8px)',
                      color: 'var(--accent-volt)',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      border: '1px solid rgba(163, 230, 53, 0.4)',
                    }}
                  >
                    🚀 {item.status}
                  </span>
                </div>
                <div
                  style={{ position: 'absolute', bottom: '12px', left: '12px' }}
                >
                  <span className="badge badge-pill-dark">{item.tag}</span>
                </div>
              </div>

              <div style={{ padding: '20px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                  <h3
                    style={{
                      fontSize: '1.1rem',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                    }}
                  >
                    {item.title}
                  </h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {item.subtitle}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
