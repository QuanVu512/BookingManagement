/**
 * C12 — Chính sách hồ sơ (domain thuần, không Nest/Prisma).
 * - fullName: trim, 1..150 ký tự, phải có ký tự không phải khoảng trắng.
 * - avatarUrl: optional; rỗng → null; chỉ chấp nhận http/https, không
 *   khoảng trắng/ký tự điều khiển, độ dài ≤ 2000. Không nhận data:/javascript:.
 * - email/phone/roles KHÔNG chỉnh ở đây (D15 — identity change cần proof
 *   riêng, hiện chỉ đọc).
 */
export interface NormalizedProfilePatch {
  fullName?: string;
  avatarUrl?: string | null;
}

export function normalizeFullName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Họ tên phải là chuỗi.');
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 150 || !/\S/.test(trimmed)) {
    throw new Error('Họ tên từ 1 đến 150 ký tự.');
  }
  return trimmed;
}

export function normalizeAvatarUrl(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error('Ảnh đại diện phải là URL.');
  }
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (trimmed.length > 2000 || /\s/.test(trimmed)) {
    throw new Error('URL ảnh đại diện không hợp lệ.');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('URL ảnh đại diện không hợp lệ.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ảnh đại diện chỉ chấp nhận liên kết http/https.');
  }
  return parsed.toString();
}

/** Chuẩn hóa partial update: chỉ các field được gửi mới validate. */
export function normalizeProfilePatch(input: {
  fullName?: unknown;
  avatarUrl?: unknown;
}): NormalizedProfilePatch {
  const patch: NormalizedProfilePatch = {};
  if (input.fullName !== undefined) {
    patch.fullName = normalizeFullName(input.fullName);
  }
  if (input.avatarUrl !== undefined) {
    patch.avatarUrl = normalizeAvatarUrl(input.avatarUrl);
  }
  return patch;
}
