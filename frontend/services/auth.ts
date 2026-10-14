import type { RegistrationData, RoleType, UserProfile } from '../types/auth';
import { API_BASE_URL, READ_REQUEST_TIMEOUT_MS } from '../constants/network';

const AUTH_ERROR_MESSAGE = 'Không thể xử lý xác thực. Vui lòng thử lại.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRole(value: unknown): value is RoleType {
  return (
    value === 'CUSTOMER' ||
    value === 'STAFF' ||
    value === 'MANAGER' ||
    value === 'ADMIN'
  );
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.username === 'string' &&
    typeof value.fullName === 'string' &&
    (typeof value.email === 'string' || value.email === null) &&
    typeof value.phone === 'string' &&
    Array.isArray(value.roles) &&
    value.roles.every(isRole) &&
    typeof value.primaryRole === 'string' &&
    typeof value.isStaffOrAdmin === 'boolean'
  );
}

function getErrorMessage(body: unknown): string {
  if (!isRecord(body)) return AUTH_ERROR_MESSAGE;
  if (typeof body.message === 'string') return body.message;
  if (
    Array.isArray(body.message) &&
    body.message.every((message) => typeof message === 'string')
  ) {
    return body.message.join('\n');
  }
  return AUTH_ERROR_MESSAGE;
}

async function authenticate(
  endpoint: string,
  payload: unknown,
): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  const body: unknown = await response.json();
  if (!response.ok) throw new Error(getErrorMessage(body));
  if (!isRecord(body) || !isUserProfile(body.user))
    throw new Error(AUTH_ERROR_MESSAGE);
  return body.user;
}

export function loginAccount(
  username: string,
  password: string,
): Promise<UserProfile> {
  return authenticate('login', { username: username.trim(), password });
}

export function registerAccount(
  payload: RegistrationData,
): Promise<UserProfile> {
  return authenticate('register', payload);
}

export async function getCurrentUser(
  signal: AbortSignal,
): Promise<UserProfile | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      credentials: 'include',
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
      ]),
    });
    if (response.status === 401) return null;
    const body: unknown = await response.json();
    if (!response.ok) throw new Error(getErrorMessage(body));
    if (!isRecord(body) || !isUserProfile(body.user))
      throw new Error(AUTH_ERROR_MESSAGE);
    return body.user;
  } catch (error: unknown) {
    if (signal.aborted) throw error;
    console.info(
      'Phiên đăng nhập chưa khả dụng; tiếp tục ở trạng thái chưa đăng nhập.',
    );
    return null;
  }
}

export async function logoutAccount(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) throw new Error(AUTH_ERROR_MESSAGE);
}
