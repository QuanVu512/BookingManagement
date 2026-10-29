import React from 'react';
import Link from 'next/link';
import styles from './legal.module.css';

interface CollectionNoticeProps {
  purposeText?: string;
  className?: string;
}

export const CollectionNotice: React.FC<CollectionNoticeProps> = ({
  purposeText = 'Thông tin của bạn được sử dụng để xác nhận đặt sân, gửi thông báo và hỗ trợ khách hàng theo',
  className,
}) => {
  return (
    <div className={`${styles.noticeBox} ${className || ''}`} role="note" aria-label="Thông báo bảo vệ dữ liệu">
      <span>{purposeText} </span>
      <Link href="/privacy" className={styles.noticeLink} target="_blank" rel="noopener noreferrer">
        Chính sách quyền riêng tư
      </Link>
      <span> và </span>
      <Link href="/terms" className={styles.noticeLink} target="_blank" rel="noopener noreferrer">
        Điều khoản dịch vụ
      </Link>
      <span> của SMASH ARENA PICKLEBALL.</span>
    </div>
  );
};
