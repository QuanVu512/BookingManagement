import {
  API_BASE_URL,
  AUTH_REQUEST_TIMEOUT_MS,
} from '../../../constants/network';
import { csrfToken } from '../../../services/auth';

export interface ProfileUpdateInput {
  fullName?: string;
  avatarUrl?: string | null;
  signal?: AbortSignal;
}

export interface UpdatedProfile {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseUpdatedProfile(data: unknown): UpdatedProfile {
  if (!isRecord(data)) throw new Error('Hồ sơ trả về không hợp lệ.');
  const text = (name: string, optional = false): string => {
    const value = data[name];
    if (value === null && optional) return '';
    if (typeof value !== 'string' || !value) throw new Error(`Thiếu ${name}.`);
    return value;
  };
  const avatar = data['avatarUrl'];
  if (avatar !== null && avatar !== undefined && typeof avatar !== 'string') {
    throw new Error('Thiếu avatarUrl.');
  }
  return {
    userId: text('userId'),
    fullName: text('fullName'),
    avatarUrl:
      typeof avatar === 'string' && avatar !== '' ? avatar : null,
    updatedAt: text('updatedAt'),
  };
}

/** C12: PATCH /api/users/me/profile — chỉ fullName/avatarUrl (D15). */
export async function updateMyProfile(
  input: ProfileUpdateInput,
): Promise<UpdatedProfile> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    ...(input.signal ? [input.signal] : []),
  ]);
  const response = await fetch(`${API_BASE_URL}/api/users/me/profile`, {
    method: 'PATCH',
    credentials: 'include',
    cache: 'no-store',
    signal,
    headers: {
      'X-CSRF-Token': await csrfToken(signal),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    }),
  });
  const payload: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      isRecord(payload) && typeof payload.message === 'string'
        ? payload.message
        : 'Không cập nhật được hồ sơ.',
    );
  if (!isRecord(payload) || payload.success !== true)
    throw new Error('Phản hồi hồ sơ không hợp lệ.');
  return parseUpdatedProfile(payload.data);
}
