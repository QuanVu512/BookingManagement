'use client';

import React from 'react';

export function FacilitiesSection() {
  const facilities = [
    {
      icon: '🏟️',
      title: 'Mặt sân thi đấu tiêu chuẩn',
      desc: 'Mặt sân giảm chấn chuyên dụng, độ nảy bóng chuẩn xác, chống trơn trượt tối đa trong mọi điều kiện thi đấu.',
    },
    {
      icon: '💡',
      title: 'Hệ thống đèn LED thể thao',
      desc: 'Chiếu sáng chống chói góc rộng đạt chuẩn thi đấu buổi tối, bảo vệ mắt và cung cấp tầm nhìn tối ưu.',
    },
    {
      icon: '🚿',
      title: 'Phòng thay đồ & Tủ đồ',
      desc: 'Khu vực thay đồ sạch sẽ, ngăn nắp với tủ bảo quản tư trang an toàn cho người chơi và câu lạc bộ.',
    },
    {
      icon: '🥤',
      title: 'Dịch vụ nước uống & Giải khát',
      desc: 'Cung cấp nước khoáng, nước uống điện giải thể thao và khăn lạnh phục vụ nhanh ngay tại sân.',
    },
    {
      icon: '🪑',
      title: 'Khu nghỉ ngơi có mái che',
      desc: 'Không gian ghế nghỉ mát mẻ có quạt công nghiệp và mái che cách nhiệt để hồi phục thể lực giữa các set đấu.',
    },
    {
      icon: '🚗',
      title: 'Bãi đỗ xe rộng rãi',
      desc: 'Khu vực gửi xe máy và ô tô thuận tiện ngay tại ngõ vào sân đấu, đảm bảo an ninh cho vận động viên.',
    },
  ];

  return (
    <section
      id="facilities"
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
            Dịch vụ tại sân
          </div>
          <h2
            style={{
              fontSize: 'clamp(1.7rem, 3.2vw, 2.2rem)',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Tiện Ích & Dịch Vụ{' '}
            <span className="gradient-volt-text">Tại Cơ Sở</span>
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              marginTop: '6px',
              fontSize: '0.92rem',
            }}
          >
            Từ mặt sân, ánh sáng đến khu thay đồ và nghỉ ngơi, các tiện ích được
            bố trí để bạn thuận tiện trước, trong và sau buổi chơi.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '20px',
          }}
        >
          {facilities.map((f, i) => (
            <div
              key={i}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
                padding: '24px',
                display: 'flex',
                gap: '16px',
                alignItems: 'flex-start',
                transition: 'border-color var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(163, 230, 53, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)';
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: 'rgba(163, 230, 53, 0.1)',
                  border: '1px solid rgba(163, 230, 53, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.3rem',
                  flexShrink: 0,
                }}
              >
                {f.icon}
              </div>
              <div>
                <h3
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: '6px',
                  }}
                >
                  {f.title}
                </h3>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}
                >
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
