'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthActions, useAuthSession } from '../../context/auth-context';
import { ThemeToggle } from '../../components/theme/theme-toggle';

export default function DashboardPage() {
  const {
    user,
    isAuthenticated,
    isLoading,
    status,
    sessionError,
    logoutError,
  } = useAuthSession();
  const { logout, refreshSession } = useAuthActions();
  const router = useRouter();

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-dark)',
        }}
      >
        <div style={{ color: 'var(--accent-volt)', fontWeight: 700 }}>
          Đang tải dữ liệu quản trị...
        </div>
      </div>
    );
  }

  if (status === 'unknown') {
    return (
      <main className="container">
        <p role="status">{sessionError}</p>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void refreshSession()}
        >
          Thử lại phiên đăng nhập
        </button>
      </main>
    );
  }

  // Guard: if not authenticated or not staff/admin
  if (!isAuthenticated || !user?.isStaffOrAdmin) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-dark)',
          padding: '20px',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            background: 'var(--bg-card)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 'var(--radius-lg)',
            padding: '36px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
          <h2
            style={{
              fontSize: '1.4rem',
              fontWeight: 800,
              color: 'var(--text-primary)',
              marginBottom: '8px',
            }}
          >
            Yêu Cầu Quyền Quản Trị
          </h2>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              marginBottom: '24px',
              lineHeight: 1.5,
            }}
          >
            Khu vực này chỉ dành cho các vai trò quản trị (
            <strong>ADMIN</strong>, <strong>MANAGER</strong>,{' '}
            <strong>STAFF</strong>). Tài khoản hiện tại của bạn không có quyền
            truy cập trang này.
          </p>
          <Link href="/" className="btn btn-primary" style={{ width: '100%' }}>
            ← Quay Lại Trang Chủ Đặt Sân
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-dark)',
        color: 'var(--text-primary)',
      }}
    >
      {/* Admin Top Navigation */}
      <header
        style={{
          background: 'var(--bg-header)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <span
              style={{
                fontWeight: 900,
                fontSize: '1.2rem',
                color: 'var(--text-primary)',
              }}
            >
              SMASH ARENA{' '}
              <span style={{ color: 'var(--accent-volt)' }}>DASHBOARD</span>
            </span>
          </div>
          <span className="badge badge-vip">VAI TRÒ: {user.primaryRole}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <ThemeToggle compact />
          <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            Xin chào,{' '}
            <strong style={{ color: 'var(--text-primary)' }}>
              {user.fullName}
            </strong>
          </div>
          <Link href="/" className="btn btn-sm btn-outline-volt">
            Trang Chủ Khách Hàng 🏟️
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={async () => {
              try {
                await logout();
                router.push('/');
              } catch {
                /* Auth context retains the session and displays the failure. */
              }
            }}
          >
            Đăng Xuất
          </button>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="container" style={{ padding: '36px 24px' }}>
        {logoutError && <p role="alert">{logoutError}</p>}
        {/* Metric Cards Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '20px',
            marginBottom: '36px',
          }}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              Tổng Lượt Đặt Hôm Nay
            </div>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                color: 'var(--text-primary)',
                marginTop: '6px',
              }}
            >
              42 lượt
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--accent-volt)',
                marginTop: '4px',
              }}
            >
              ↑ +15% so với hôm qua
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              Doanh Thu Tạm Tính
            </div>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                color: 'var(--accent-volt)',
                marginTop: '6px',
              }}
            >
              9.840.000 đ
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginTop: '4px',
              }}
            >
              Bao gồm tiền cọc PayOS
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              Khách Vãng Lai (Guest)
            </div>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                color: 'var(--status-warning)',
                marginTop: '6px',
              }}
            >
              18 lượt
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginTop: '4px',
              }}
            >
              Đã gửi E-bill qua Email
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg-card)',
              padding: '20px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
              }}
            >
              Tỷ Lệ Lấp Đầy Giờ Vàng
            </div>
            <div
              style={{
                fontSize: '2rem',
                fontWeight: 900,
                color: 'var(--status-info)',
                marginTop: '6px',
              }}
            >
              92%
            </div>
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
                marginTop: '4px',
              }}
            >
              Khung 17:00 - 21:00
            </div>
          </div>
        </div>

        {/* Recent Bookings Table */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
            padding: '24px',
            boxShadow: 'var(--shadow-card)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px',
            }}
          >
            <h3
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
              }}
            >
              Danh Sách Đặt Chỗ Mới Nhất
            </h3>
            <span className="badge badge-standard">DỮ LIỆU THỜI GIAN THỰC</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.9rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}
                >
                  <th style={{ padding: '12px 16px' }}>MÃ ĐẶT CHỖ</th>
                  <th style={{ padding: '12px 16px' }}>KHÁCH HÀNG</th>
                  <th style={{ padding: '12px 16px' }}>LOẠI KHÁCH</th>
                  <th style={{ padding: '12px 16px' }}>SÂN THI ĐẤU</th>
                  <th style={{ padding: '12px 16px' }}>KHUNG GIỜ</th>
                  <th style={{ padding: '12px 16px' }}>TRẠNG THÁI</th>
                  <th style={{ padding: '12px 16px' }}>E-BILL EMAIL</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontWeight: 700,
                      color: 'var(--accent-volt)',
                    }}
                  >
                    BK-8X91AC
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Trần Đình Khang
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge badge-vip">CUSTOMER</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>Center Court Pro #1</td>
                  <td style={{ padding: '14px 16px' }}>
                    18:00 - 20:00 (Hôm nay)
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--status-success)',
                    }}
                  >
                    ● Đã cọc 30%
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    khang.tran@gmail.com
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontWeight: 700,
                      color: 'var(--accent-volt)',
                    }}
                  >
                    BK-3F90BZ
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Lê Hoàng Nam (Guest)
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge badge-standard">GUEST</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    Championship Arena #2
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    19:00 - 21:00 (Hôm nay)
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--status-info)',
                    }}
                  >
                    ● Trả 100%
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--accent-volt)',
                    }}
                  >
                    nam.le@company.vn ✓
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                  <td
                    style={{
                      padding: '14px 16px',
                      fontWeight: 700,
                      color: 'var(--accent-volt)',
                    }}
                  >
                    BK-1P44KL
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Nguyễn Minh Đức
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span className="badge badge-vip">CUSTOMER</span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>Pickle Standard #3</td>
                  <td style={{ padding: '14px 16px' }}>
                    08:00 - 10:00 (Ngày mai)
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--status-success)',
                    }}
                  >
                    ● Đã cọc 30%
                  </td>
                  <td
                    style={{
                      padding: '14px 16px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    duc.nguyen@outlook.com
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
