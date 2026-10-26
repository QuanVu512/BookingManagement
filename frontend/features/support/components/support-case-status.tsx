'use client';

import React, { useState } from 'react';
import type { SupportCaseItem } from '../model/support-case';
import { lookupSupportCaseStatus } from '../api/support-service';
import styles from './support.module.css';

export const SupportCaseStatusLookup: React.FC = () => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseData, setCaseData] = useState<SupportCaseItem | null>(null);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setError(null);
    setLoading(true);

    try {
      const data = await lookupSupportCaseStatus(code.trim());
      setCaseData(data);
    } catch (err: any) {
      setError(err.message || 'Không tìm thấy hồ sơ khiếu nại tương ứng.');
      setCaseData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '640px', marginTop: '2rem' }}>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--ink, #f8fafc)', marginBottom: '0.75rem' }}>
        Tra cứu tiến độ hồ sơ đã gửi
      </h3>
      <form onSubmit={handleLookup} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Nhập mã tra cứu (ví dụ SPT-123456)..."
          className={styles.input}
          style={{ flex: 1 }}
          required
        />
        <button type="submit" disabled={loading} className={styles.submitBtn}>
          {loading ? 'Đang tìm...' : 'Tra cứu'}
        </button>
      </form>

      {error && (
        <div className={styles.errorAlert} role="alert">
          {error}
        </div>
      )}

      {caseData && (
        <div className={styles.statusCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <span style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink, #f8fafc)' }}>
              Mã hồ sơ: {caseData.caseCode}
            </span>
            <span
              style={{
                padding: '0.25rem 0.6rem',
                borderRadius: '4px',
                fontSize: '0.8125rem',
                fontWeight: 600,
                background:
                  caseData.status === 'RESOLVED' || caseData.status === 'CLOSED'
                    ? 'rgba(74, 222, 128, 0.2)'
                    : 'rgba(163, 230, 53, 0.2)',
                color:
                  caseData.status === 'RESOLVED' || caseData.status === 'CLOSED'
                    ? 'var(--status-success, #4ade80)'
                    : 'var(--accent-volt, #a3e635)',
              }}
            >
              {caseData.status}
            </span>
          </div>

          <p style={{ margin: '0.5rem 0' }}>
            Ngày tiếp nhận:{' '}
            <strong>{new Date(caseData.receivedAt).toLocaleDateString('vi-VN')}</strong>
          </p>
          <p style={{ margin: '0.5rem 0' }}>
            Hạn mục tiêu giải quyết:{' '}
            <strong>{new Date(caseData.resolutionTargetAt).toLocaleDateString('vi-VN')}</strong>
          </p>
          {caseData.publicNotes && (
            <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-input, rgba(0,0,0,0.3))', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #64748b)', marginBottom: '0.25rem' }}>
                Ghi chú tiến độ từ điều phối viên:
              </div>
              <div style={{ color: 'var(--ink, #f8fafc)', fontSize: '0.9375rem' }}>
                {caseData.publicNotes}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
