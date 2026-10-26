'use client';

import { useState } from 'react';
import { updateMyProfile } from '../api/profile-service';

/**
 * C12 — Sửa họ tên / ảnh đại diện. email/phone/roles chỉ đọc (D15),
 * không có control sửa ở đây. Lưu xong gọi onSaved để phía trên
 * refresh session từ server.
 */
// UNVERIFIED (frontend test scope BLOCKED) — authored per plan, not executed.
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

  async function save(): Promise<void> {
    const name = fullName.trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > 150) {
      setError('Họ tên từ 1 đến 150 ký tự.');
      return;
    }
    const avatar = avatarUrl.trim();
    if (avatar !== '') {
      try {
        const parsed = new URL(avatar);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setError('Ảnh đại diện chỉ chấp nhận liên kết http/https.');
          return;
        }
      } catch {
        setError('URL ảnh đại diện không hợp lệ.');
        return;
      }
    }
    setPending(true);
    setError('');
    try {
      await updateMyProfile({
        fullName: name,
        avatarUrl: avatar === '' ? null : avatar,
      });
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
    <section aria-label="Chỉnh sửa hồ sơ">
      <h3>Cập nhật hồ sơ</h3>
      <p>
        <label>
          Họ tên{' '}
          <input
            type="text"
            value={fullName}
            maxLength={150}
            disabled={pending}
            onChange={(event) => setFullName(event.target.value)}
          />
        </label>
      </p>
      <p>
        <label>
          Ảnh đại diện (URL https, để trống để xóa){' '}
          <input
            type="url"
            value={avatarUrl}
            maxLength={2000}
            disabled={pending}
            onChange={(event) => setAvatarUrl(event.target.value)}
          />
        </label>
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={pending} onClick={() => void save()}>
        {pending ? 'Đang lưu…' : 'Lưu hồ sơ'}
      </button>
    </section>
  );
}
