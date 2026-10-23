import type { EmailVerificationFlow } from '../types/auth';

export const VERIFICATION_EMAIL_KEY = 'booking:verification-email';

export function authReturnPath(): string {
  const next = new URLSearchParams(window.location.search).get('next') ?? '/';
  return /^\/(?:courts\/[a-zA-Z0-9-]+|booking|bookings|account(?:\/(?:security|payments))?)?$/.test(
    next,
  )
    ? next
    : '/';
}

export function rememberVerificationEmail(email: string): void {
  try {
    window.sessionStorage.setItem(VERIFICATION_EMAIL_KEY, email);
  } catch {
    // The verification page also accepts the email when storage is unavailable.
  }
}

export function readVerificationEmail(): string {
  try {
    return window.sessionStorage.getItem(VERIFICATION_EMAIL_KEY) ?? '';
  } catch {
    return '';
  }
}

const VERIFICATION_FLOW_KEY = 'booking:verification-flow';
let verificationFlow: EmailVerificationFlow | null = null;

export function rememberVerificationFlow(flow: EmailVerificationFlow): void {
  verificationFlow = flow;
  rememberVerificationEmail(flow.email);
  try {
    window.sessionStorage.setItem(VERIFICATION_FLOW_KEY, JSON.stringify(flow));
  } catch {
    // Memory keeps the redirect working when browser storage is unavailable.
  }
}

export function readVerificationFlow(): EmailVerificationFlow | null {
  try {
    const raw = window.sessionStorage.getItem(VERIFICATION_FLOW_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'email' in value &&
      typeof value.email === 'string' &&
      'token' in value &&
      typeof value.token === 'string' &&
      /^[a-f0-9]{64}$/.test(value.token)
    )
      return { email: value.email, token: value.token };
    return null;
  } catch {
    return verificationFlow;
  }
}

export function clearVerificationFlow(): void {
  verificationFlow = null;
  try {
    window.sessionStorage.removeItem(VERIFICATION_FLOW_KEY);
  } catch {
    // Memory has already been cleared.
  }
}
