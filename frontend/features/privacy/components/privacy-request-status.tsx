'use client';

import React, { useEffect, useState } from 'react';
import type { PrivacyRequestItem } from '../model/privacy-request';
import { listMyPrivacyRequests } from '../api/privacy-service';
import styles from './privacy.module.css';

export const PrivacyRequestStatusList: React.FC = () => {
  const [requests, setRequests] = useState<PrivacyRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyPrivacyRequests()
      .then((data) => {
        if (active) {
          setRequests(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <p>Đang tải danh sách yêu cầu quyền riêng tư...</p>;
  }

  if (error) {
    return (
      <div className={styles.errorAlert} role="alert">
        Không thể tải danh sách yêu cầu: {error}
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <p style={{ color: 'var(--text-secondary, #94a3b8)' }}>
        Bạn chưa gửi yêu cầu quyền riêng tư nào.
      </p>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Mã hồ sơ</th>
            <th>Loại quyền</th>
            <th>Ngày gửi</th>
            <th>Hạn phản hồi</th>
            <th>Trạng thái</th>
            <th>Ghi chú phản hồi</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((req) => (
            <tr key={req.id}>
              <td>
                <code>{req.id.slice(0, 8)}...</code>
              </td>
              <td>{req.type}</td>
              <td>{new Date(req.receivedAt).toLocaleDateString('vi-VN')}</td>
              <td>{new Date(req.responseDueAt).toLocaleDateString('vi-VN')}</td>
              <td>
                <span
                  style={{
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    background:
                      req.status === 'COMPLETED'
                        ? 'rgba(74, 222, 128, 0.2)'
                        : req.status === 'REJECTED'
                          ? 'rgba(239, 68, 68, 0.2)'
                          : 'rgba(163, 230, 53, 0.2)',
                    color:
                      req.status === 'COMPLETED'
                        ? 'var(--status-success, #4ade80)'
                        : req.status === 'REJECTED'
                          ? '#fca5a5'
                          : 'var(--accent-volt, #a3e635)',
                  }}
                >
                  {req.status}
                </span>
              </td>
              <td style={{ maxWidth: '300px' }}>{req.publicNotes || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
