'use client';

import React from 'react';

export function SportyFooter() {
  return (
    <footer
      id="about"
      style={{
        backgroundColor: 'var(--bg-dark)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '60px 0 30px',
        color: 'var(--text-muted)',
      }}
    >
      <div className="container">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '40px',
            marginBottom: '40px',
          }}
        >
          {/* Brand Col */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background:
                    'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                  border: '1px solid rgba(163, 230, 53, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg
                  width="18"
                  height="18"
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
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '1.2rem',
                  color: 'var(--text-primary)',
                }}
              >
                SMASH <span style={{ color: 'var(--accent-volt)' }}>ARENA</span>
              </span>
            </div>
            <p
              style={{
                fontSize: '0.88rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
              }}
            >
              Tổ hợp sân thể thao chất lượng cao phục vụ tập luyện và thi đấu
              phong trào tại Phù Đổng, Hà Nội.
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4
              style={{
                color: 'var(--text-primary)',
                fontSize: '0.92rem',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              DỊCH VỤ & TIỆN ÍCH
            </h4>
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.88rem',
              }}
            >
              <li>
                <a
                  href="#courts-catalog"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Đặt sân theo giờ
                </a>
              </li>
              <li>
                <a
                  href="#courts-catalog"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Đặt sân định kỳ cho câu lạc bộ
                </a>
              </li>
              <li>
                <a
                  href="#facilities"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Dịch vụ nước uống và khăn lạnh
                </a>
              </li>
              <li>
                <a
                  href="#facilities"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Khu vực nghỉ ngơi và thay đồ
                </a>
              </li>
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h4
              style={{
                color: 'var(--text-primary)',
                fontSize: '0.92rem',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              CHÍNH SÁCH ĐẶT SÂN
            </h4>
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.88rem',
              }}
            >
              <li>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Chọn ngày và khung giờ phù hợp với kế hoạch của bạn
                </span>
              </li>
              <li>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Xem giá thuê và dịch vụ đi kèm trong chi tiết đơn
                </span>
              </li>
              <li>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Kiểm tra thông tin trước khi tiếp tục quy trình đặt sân
                </span>
              </li>
              <li>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Liên hệ đội ngũ nếu cần hỗ trợ chọn sân
                </span>
              </li>
            </ul>
          </div>

          {/* Contact & Venue Information */}
          <div>
            <h4
              style={{
                color: 'var(--text-primary)',
                fontSize: '0.92rem',
                fontWeight: 700,
                marginBottom: '16px',
              }}
            >
              THÔNG TIN LIÊN HỆ
            </h4>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--accent-volt)',
                marginBottom: '8px',
              }}
            >
              Liên hệ: 0362313005
            </div>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              Cơ sở: Ngõ 80 Đường Phù Đổng - Cầu Trạc, Xã Phù Đổng, Hà Nội
              <br />
              Email hỗ trợ: hotro@smasharena.vn
            </p>
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid var(--border-soft)',
            paddingTop: '24px',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--text-muted)',
          }}
        >
          © 2026 SMASH ARENA — Sân Thể Thao Phù Đổng, Gia Lâm, Hà Nội.
        </div>
      </div>
    </footer>
  );
}
