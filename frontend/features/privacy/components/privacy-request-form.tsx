'use client';

import React, { useState } from 'react';
import type { PrivacyRequestType, PrivacyRequestItem } from '../model/privacy-request';
import { submitPrivacyRequest } from '../api/privacy-service';
import styles from './privacy.module.css';

interface PrivacyRequestFormProps {
  onSubmitted?: (request: PrivacyRequestItem) => void;
  defaultEmail?: string;
}

export const PrivacyRequestForm: React.FC<PrivacyRequestFormProps> = ({
  onSubmitted,
  defaultEmail = '',
}) => {
  const [type, setType] = useState<PrivacyRequestType>('ACCESS');
  const [email, setEmail] = useState(defaultEmail);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<PrivacyRequestItem | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (description.trim().length < 10) {
      setError('Vui lòng mô tả chi tiết yêu cầu tối thiểu 10 ký tự.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitPrivacyRequest({
        type,
        description,
        contactEmail: email.trim() || undefined,
      });
      setSuccessResult(result);
      if (onSubmitted) {
        onSubmitted(result);
      }
    } catch (err: any) {
      setError(err.message || 'Gửi yêu cầu thất bại. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (successResult) {
    return (
      <div className={styles.successCard} role="status">
        <h3 style={{ color: 'var(--status-success, #4ade80)', marginTop: 0 }}>
          Yêu cầu đã được tiếp nhận thành công
        </h3>
        <p>
          Mã hồ sơ: <strong>{successResult.id}</strong>
        </p>
        <p>
          Trạng thái: <strong>{successResult.status}</strong>
        </p>
        <p>
          Hạn phản hồi dự kiến:{' '}
          <strong>
            {new Date(successResult.responseDueAt).toLocaleDateString('vi-VN')}
          </strong>
        </p>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #94a3b8)' }}>
          Bộ phận bảo vệ dữ liệu sẽ liên hệ xác minh danh tính và xử lý yêu cầu của bạn.
        </p>
        <button
          type="button"
          onClick={() => {
            setSuccessResult(null);
            setDescription('');
          }}
          className={styles.submitBtn}
          style={{ marginTop: '1rem' }}
        >
          Gửi yêu cầu khác
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.formContainer}>
      {error && (
        <div className={styles.errorAlert} role="alert">
          {error}
        </div>
      )}

      <div className={styles.formGroup}>
        <label htmlFor="req-type" className={styles.label}>
          Quyền dữ liệu bạn muốn thực thi:
        </label>
        <select
          id="req-type"
          value={type}
          onChange={(e) => setType(e.target.value as PrivacyRequestType)}
          className={styles.select}
          disabled={submitting}
        >
          <option value="ACCESS">Yêu cầu trích xuất / Cung cấp dữ liệu (Access)</option>
          <option value="CORRECT">Yêu cầu đính chính / Sửa đổi thông tin (Correction)</option>
          <option value="ERASE">Yêu cầu đóng tài khoản / Xóa dữ liệu (Erasure)</option>
          <option value="WITHDRAW">Rút lại sự đồng ý đã cấp (Withdraw consent)</option>
          <option value="RESTRICT">Hạn chế xử lý dữ liệu (Restriction)</option>
          <option value="OBJECT">Phản đối xử lý dữ liệu (Objection)</option>
          <option value="OTHER">Yêu cầu quyền riêng tư khác (Other)</option>
        </select>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="req-email" className={styles.label}>
          Email liên hệ nhận kết quả xác minh:
        </label>
        <input
          id="req-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          className={styles.input}
          disabled={submitting}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="req-desc" className={styles.label}>
          Mô tả chi tiết yêu cầu:
        </label>
        <textarea
          id="req-desc"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Vui lòng cung cấp chi tiết thông tin hoặc phạm vi dữ liệu bạn cần hỗ trợ..."
          className={styles.textarea}
          disabled={submitting}
          required
        />
        <small style={{ color: 'var(--text-muted, #64748b)' }}>
          Tối thiểu 10 ký tự, tối đa 2000 ký tự. Không gửi thông tin mật khẩu hoặc số thẻ ngân hàng.
        </small>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className={styles.submitBtn}
      >
        {submitting ? 'Đang gửi...' : 'Gửi yêu cầu quyền riêng tư'}
      </button>
    </form>
  );
};
