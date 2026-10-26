'use client';

import React from 'react';
import Link from 'next/link';

interface TransactionTermsProps {
  accepted: boolean;
  onAcceptanceChange: (accepted: boolean) => void;
  disabled?: boolean;
}

export const TransactionTerms: React.FC<TransactionTermsProps> = ({
  accepted,
  onAcceptanceChange,
  disabled = false,
}) => {
  return (
    <div
      style={{
        margin: '1.25rem 0',
        padding: '1rem',
        borderRadius: 'var(--radius-sm, 8px)',
        background: 'var(--surface-subtle, rgba(255, 255, 255, 0.03))',
        border: '1px solid var(--line, rgba(255, 255, 255, 0.08))',
        fontSize: '0.875rem',
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--ink, #f8fafc)', marginBottom: '0.5rem' }}>
        Xác nhận giao kết hợp đồng đặt sân
      </div>

      <ul style={{ margin: '0 0 0.75rem 1.25rem', padding: 0, color: 'var(--text-secondary, #94a3b8)' }}>
        <li>Mọi đơn đặt sân mới yêu cầu thanh toán đặt cọc đúng <strong>30% tiền thuê sân</strong>. Thời gian giữ chỗ tạm thời là <strong>5 phút</strong> để hoàn tất thanh toán cọc. 70% tiền thuê sân còn lại sẽ được thanh toán sau theo quy trình tại cơ sở.</li>
        <li>Khung giờ check-in: từ giờ bắt đầu đến giờ kết thúc slot. Check-in muộn không kéo dài thời gian chơi; không check-in sẽ chuyển sang Vắng mặt (No-Show).</li>
        <li>Hủy trước 12 tiếng: Giữ lại 10% tiền thuê sân và hoàn lại 20%. Hủy sát giờ (dưới 12 tiếng) hoặc No-Show: Mất toàn bộ 30% tiền cọc thuê sân. Phí phạt không áp dụng trên dịch vụ đi kèm.</li>
      </ul>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0.625rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: 'var(--ink, #f8fafc)',
          fontWeight: 500,
        }}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => onAcceptanceChange(e.target.checked)}
          disabled={disabled}
          required
          style={{
            marginTop: '0.2rem',
            accentColor: 'var(--accent-volt, #a3e635)',
            width: '1.125rem',
            height: '1.125rem',
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
          aria-describedby="terms-summary-note"
        />
        <span>
          Tôi xác nhận đã đọc và đồng ý với{' '}
          <Link
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-volt, #a3e635)', textDecoration: 'underline' }}
          >
            Điều khoản dịch vụ
          </Link>{' '}
          và{' '}
          <Link
            href="/refund-policy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--accent-volt, #a3e635)', textDecoration: 'underline' }}
          >
            Chính sách hủy & hoàn tiền
          </Link>
          .
        </span>
      </label>
      <small id="terms-summary-note" style={{ display: 'none' }}>
        Yêu cầu chấp thuận điều khoản đặt sân trước khi thanh toán
      </small>
    </div>
  );
};
