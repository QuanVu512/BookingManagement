'use client';

import React from 'react';
import { useAuthActions, useAuthDialog } from '../../context/auth-context';

export function GuestConfirmDialog() {
  const { isGuestConfirmOpen, pendingCourt } = useAuthDialog();
  const { closeGuestConfirm, openAuthModal, proceedAsGuest } = useAuthActions();

  if (!isGuestConfirmOpen) return null;

  return (
    <div className="modal-overlay" onClick={closeGuestConfirm}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '440px',
          border: '1px solid rgba(249, 115, 22, 0.4)',
        }}
      >
        <div
          className="modal-header"
          style={{ background: 'rgba(249, 115, 22, 0.08)' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.3rem' }}>⚠️</span>
            <h3
              style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fed7aa' }}
            >
              Xác nhận đặt sân không tài khoản
            </h3>
          </div>
          <button
            className="modal-close"
            onClick={closeGuestConfirm}
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>

        <div
          className="modal-body"
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {pendingCourt && (
            <div
              style={{
                background: 'var(--bg-pill)',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Sân đang chọn:
              </div>
              <div
                style={{
                  fontWeight: 600,
                  color: 'var(--accent-volt)',
                  fontSize: '0.95rem',
                }}
              >
                {pendingCourt.name} • Mã {pendingCourt.code}
              </div>
            </div>
          )}

          {/* Core Warning Notice */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 'var(--radius-md)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            <div
              style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}
            >
              <span style={{ fontSize: '1.1rem', color: '#f87171' }}>🚫</span>
              <p
                style={{
                  fontSize: '0.88rem',
                  color: 'var(--text-primary)',
                  lineHeight: 1.5,
                }}
              >
                Nếu tiếp tục đặt sân <strong>không đăng nhập</strong>, bạn sẽ{' '}
                <strong style={{ color: '#fca5a5' }}>
                  không thể xem lại lịch sử đặt sân
                </strong>{' '}
                trên trang web.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                borderTop: '1px dashed var(--border-subtle)',
                paddingTop: '10px',
              }}
            >
              <span style={{ fontSize: '1.1rem', color: 'var(--accent-volt)' }}>
                ✉️
              </span>
              <p
                style={{
                  fontSize: '0.88rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                }}
              >
                Thông tin xác nhận và mã đặt chỗ vẫn sẽ được{' '}
                <strong style={{ color: 'var(--accent-volt)' }}>
                  gửi trực tiếp về địa chỉ email
                </strong>{' '}
                của bạn.
              </p>
            </div>
          </div>

          <p
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-muted)',
              textAlign: 'center',
            }}
          >
            Bạn có muốn tạo tài khoản nhanh để lưu trữ lịch sử đặt sân không?
          </p>

          {/* Action buttons */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              marginTop: '4px',
            }}
          >
            <button
              type="button"
              className="btn btn-primary"
              onClick={proceedAsGuest}
              style={{ width: '100%' }}
            >
              Tôi đã hiểu và tiếp tục đặt sân
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => openAuthModal()}
              style={{ width: '100%' }}
            >
              ← Quay lại đăng nhập
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
