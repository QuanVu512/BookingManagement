'use client';

import React, { useState } from 'react';
import type { SupportCaseCategory, SupportCaseItem } from '../model/support-case';
import { submitSupportCase } from '../api/support-service';
import styles from '../components/support.module.css';

export const SupportCaseForm: React.FC = () => {
  const [category, setCategory] = useState<SupportCaseCategory>('SERVICE');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bookingId, setBookingId] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCase, setCreatedCase] = useState<SupportCaseItem | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes('@')) {
      setError('Vui lòng cung cấp địa chỉ email hợp lệ để nhận phản hồi.');
      return;
    }

    if (description.trim().length < 10) {
      setError('Nội dung phản ánh tối thiểu 10 ký tự.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitSupportCase({
        category,
        contactEmail: email.trim(),
        contactPhone: phone.trim() || undefined,
        bookingId: bookingId.trim() || undefined,
        description: description.trim(),
      });
      setCreatedCase(result);
    } catch (err: any) {
      setError(err.message || 'Không thể gửi phản ánh. Vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  if (createdCase) {
    return (
      <div className={styles.successCard} role="status">
        <h3 style={{ color: 'var(--status-success, #4ade80)', marginTop: 0 }}>
          Hồ sơ khiếu nại / hỗ trợ đã được tạo thành công
        </h3>
        <p>
          Mã tra cứu của bạn: <strong>{createdCase.caseCode}</strong>
        </p>
        <p>
          Trạng thái hiện tại: <strong>{createdCase.status}</strong>
        </p>
        <p>
          Thời hạn phản hồi mục tiêu:{' '}
          <strong>
            {new Date(createdCase.resolutionTargetAt).toLocaleDateString('vi-VN')}
          </strong>
        </p>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', fontSize: '0.875rem' }}>
          Bạn có thể sử dụng mã tra cứu trên để kiểm tra tiến độ giải quyết vụ việc.
        </p>
        <button
          type="button"
          onClick={() => {
            setCreatedCase(null);
            setDescription('');
          }}
          className={styles.submitBtn}
          style={{ marginTop: '1rem' }}
        >
          Gửi phản ánh khác
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
        <label htmlFor="spt-cat" className={styles.label}>
          Danh mục yêu cầu / Khiếu nại:
        </label>
        <select
          id="spt-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value as SupportCaseCategory)}
          className={styles.select}
          disabled={submitting}
        >
          <option value="SERVICE">Dịch vụ sân & Chất lượng cơ sở vật chất</option>
          <option value="PAYMENT">Thanh toán & Cổng thanh toán</option>
          <option value="REFUND">Hủy sân & Hoàn tiền</option>
          <option value="PRIVACY_ROUTING">Chuyển tiếp thắc mắc về quyền riêng tư</option>
          <option value="OTHER">Vấn đề khác</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className={styles.formGroup}>
          <label htmlFor="spt-email" className={styles.label}>
            Email nhận phản hồi (*):
          </label>
          <input
            id="spt-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            className={styles.input}
            disabled={submitting}
            required
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="spt-phone" className={styles.label}>
            Số điện thoại liên hệ:
          </label>
          <input
            id="spt-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xx..."
            className={styles.input}
            disabled={submitting}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="spt-booking" className={styles.label}>
          Mã đơn đặt sân (nếu có):
        </label>
        <input
          id="spt-booking"
          type="text"
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          placeholder="Mã đơn hàng (ví dụ BK-xxxx hoặc UUID)"
          className={styles.input}
          disabled={submitting}
        />
      </div>

      <div className={styles.formGroup}>
        <label htmlFor="spt-desc" className={styles.label}>
          Nội dung phản ánh chi tiết (*):
        </label>
        <textarea
          id="spt-desc"
          rows={5}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả cụ thể sự việc cần hỗ trợ, thời gian phát sinh và mong muốn giải quyết..."
          className={styles.textarea}
          disabled={submitting}
          required
        />
      </div>

      <button
        type="submit"
        disabled={submitting}
        className={styles.submitBtn}
      >
        {submitting ? 'Đang gửi...' : 'Gửi yêu cầu hỗ trợ'}
      </button>
    </form>
  );
};
