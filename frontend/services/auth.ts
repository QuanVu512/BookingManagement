import type {
  RegistrationData,
  RoleType,
  UserProfile,
  SessionResult,
  AuthMessage,
  RegistrationResult,
} from '../types/auth';
import {
  API_BASE_URL,
  READ_REQUEST_TIMEOUT_MS,
  AUTH_REQUEST_TIMEOUT_MS,
  SESSION_TRANSIENT_RETRIES,
} from '../constants/network';

const AUTH_ERROR_MESSAGE = 'Không thể xử lý xác thực. Vui lòng thử lại.';
const SESSION_ERROR_MESSAGE =
  'Chưa thể xác nhận phiên đăng nhập. Vui lòng thử lại.';

export class AuthRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly transient = false,
    readonly code?: string,
  ) {
    super(message);
  }
}

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
    isRole(value.primaryRole) &&
    typeof value.isStaffOrAdmin === 'boolean'
  );
}
function getErrorMessage(body: unknown): string {
  if (!isRecord(body)) return AUTH_ERROR_MESSAGE;
  if (typeof body.message === 'string') return body.message;
  if (
    Array.isArray(body.message) &&
    body.message.every((message) => typeof message === 'string')
  )
    return body.message.join('\n');
  return AUTH_ERROR_MESSAGE;
}
function getErrorCode(body: unknown): string | undefined {
  return isRecord(body) && typeof body.code === 'string' ? body.code : undefined;
}
async function readResponse(response: Response): Promise<unknown> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new AuthRequestError(
      getErrorMessage(body),
      response.status,
      response.status >= 500,
      getErrorCode(body),
    );
  }
  try {
    return await response.json();
  } catch (error: unknown) {
    if (error instanceof TypeError || error instanceof DOMException)
      throw error;
    throw new AuthRequestError(AUTH_ERROR_MESSAGE);
  }
}

async function mutate(endpoint: string, payload: unknown): Promise<unknown> {
  const signal = AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS);
  try {
    const token = await csrfToken(signal);
    const response = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      body: JSON.stringify(payload),
    });
    return await readResponse(response);
  } catch (error: unknown) {
    if (error instanceof AuthRequestError) throw error;
    throw new AuthRequestError(
      signal.aborted
        ? 'Yêu cầu xác thực quá thời gian chờ. Vui lòng thử lại.'
        : AUTH_ERROR_MESSAGE,
      undefined,
      true,
    );
  }
}

export async function csrfToken(signal: AbortSignal): Promise<string> {
  const csrf = await readResponse(
    await fetch(`${API_BASE_URL}/api/auth/csrf`, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    }),
  );
  if (
    !isRecord(csrf) ||
    typeof csrf.token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(csrf.token)
  )
    throw new AuthRequestError(AUTH_ERROR_MESSAGE);
  return csrf.token;
}

export async function loginAccount(
  username: string,
  password: string,
): Promise<UserProfile> {
  const body = await mutate('login', { username: username.trim(), password });
  if (!isRecord(body) || body.success !== true || !isUserProfile(body.user))
    throw new AuthRequestError(AUTH_ERROR_MESSAGE);
  return body.user;
}
export async function registerAccount(
  payload: RegistrationData,
): Promise<RegistrationResult> {
  const body = await mutate('register', payload);
  if (
    !isRecord(body) ||
    body.success !== true ||
    body.status !== 'verification_required' ||
    typeof body.message !== 'string'
  )
    throw new AuthRequestError(AUTH_ERROR_MESSAGE);
  return {
    success: true,
    status: 'verification_required',
    message: body.message,
  };
}

async function checkSession(signal: AbortSignal): Promise<SessionResult> {
  const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
    credentials: 'include',
    cache: 'no-store',
    signal: AbortSignal.any([
      signal,
      AbortSignal.timeout(READ_REQUEST_TIMEOUT_MS),
    ]),
  });
  if (response.status === 401) return { status: 'unauthenticated' };
  const body = await readResponse(response);
  if (!isRecord(body) || body.success !== true || !isUserProfile(body.user))
    throw new AuthRequestError(SESSION_ERROR_MESSAGE);
  return { status: 'authenticated', user: body.user };
}
export async function getCurrentUser(
  signal: AbortSignal,
): Promise<SessionResult> {
  for (let attempt = 0; attempt <= SESSION_TRANSIENT_RETRIES; attempt++) {
    try {
      signal.throwIfAborted();
      return await checkSession(signal);
    } catch (error: unknown) {
      if (signal.aborted) throw error;
      const transient =
        error instanceof AuthRequestError
          ? error.transient
          : error instanceof TypeError ||
            (error instanceof DOMException && error.name === 'TimeoutError');
      if (transient && attempt < SESSION_TRANSIENT_RETRIES) continue;
      return { status: 'unknown', message: SESSION_ERROR_MESSAGE };
    }
  }
  return { status: 'unknown', message: SESSION_ERROR_MESSAGE };
}

export async function authMessage(
  endpoint:
    | 'logout'
    | 'verify-email'
    | 'resend-verification'
    | 'forgot-password'
    | 'reset-password',
  payload: unknown,
): Promise<AuthMessage> {
  const body = await mutate(endpoint, payload);
  if (
    !isRecord(body) ||
    body.success !== true ||
    typeof body.message !== 'string'
  )
    throw new AuthRequestError(AUTH_ERROR_MESSAGE);
  return { success: true, message: body.message };
}
export async function logoutAccount(): Promise<void> {
  await authMessage('logout', {});
}
