'use client';

import { useState } from 'react';
import { updateMyProfile } from '../api/profile-service';
import styles from './profile-edit-form.module.css';

/**
 * C12 — Sửa họ tên / ảnh đại diện. email/phone/roles chỉ đọc (D15),
 * không có control sửa ở đây. Lưu xong gọi onSaved để phía trên
 * refresh session từ server.
 */
export function ProfileEditForm({
  initialFullName,
  initialAvatarUrl,
  onSaved,
}: {
  initialFullName: string;
  initialAvatarUrl: string | null;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(initialFullName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function save(): Promise<void> {
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 150) {
      setError('Họ tên từ 1 đến 150 ký tự.');
      setSuccess(false);
      return;
    }
    const avatar = avatarUrl.trim();
    if (avatar !== '') {
      try {
        const parsed = new URL(avatar);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setError('Ảnh đại diện chỉ chấp nhận liên kết http/https.');
          setSuccess(false);
          return;
        }
      } catch {
        setError('URL ảnh đại diện không hợp lệ.');
        setSuccess(false);
        return;
      }
    }
    setPending(true);
    setError('');
    setSuccess(false);
    try {
      await updateMyProfile({
        fullName: name,
        avatarUrl: avatar === '' ? null : avatar,
      });
      setSuccess(true);
      onSaved();
    } catch (reason: unknown) {
      setError(
        reason instanceof Error ? reason.message : 'Không cập nhật được hồ sơ.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={styles.card} aria-label="Chỉnh sửa hồ sơ">
      <h3 className={styles.heading}>Cập nhật hồ sơ</h3>
      <div className={styles.field}>
        <label className={styles.label}>
          <span>Họ tên</span>
          <input
            className={styles.input}
            type="text"
            value={fullName}
            maxLength={150}
            disabled={pending}
            onChange={(event) => {
              setFullName(event.target.value);
              setSuccess(false);
            }}
          />
        </label>
      </div>
      <div className={styles.field}>
        <label className={styles.label}>
          <span>Ảnh đại diện (URL https, để trống để xóa)</span>
          <input
            className={styles.input}
            type="url"
            value={avatarUrl}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => {
              setAvatarUrl(event.target.value);
              setSuccess(false);
            }}
          />
        </label>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.success} role="status">
          Cập nhật hồ sơ thành công!
        </p>
      )}
      <button
        className={styles.submitBtn}
        type="button"
        disabled={pending}
        onClick={() => void save()}
      >
        {pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
      </button>
    </section>
  );
}
