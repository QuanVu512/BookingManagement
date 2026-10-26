import {
  type CookiePreferences,
  CONSENT_STORAGE_KEY,
  CONSENT_VALIDITY_DAYS,
  CURRENT_CONSENT_SCHEMA_VERSION,
  CURRENT_COOKIE_POLICY_VERSION,
  DEFAULT_PREFERENCES,
} from '../model/consent';

export function readStoredPreferences(): CookiePreferences | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.schemaVersion !== CURRENT_CONSENT_SCHEMA_VERSION ||
      parsed.policyVersion !== CURRENT_COOKIE_POLICY_VERSION
    ) {
      return null;
    }

    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      return null;
    }

    return {
      schemaVersion: 1,
      policyVersion: CURRENT_COOKIE_POLICY_VERSION,
      necessary: true,
      preferences: Boolean(parsed.preferences),
      analytics: Boolean(parsed.analytics),
      marketing: Boolean(parsed.marketing),
      decidedAt: parsed.decidedAt || new Date().toISOString(),
      expiresAt: parsed.expiresAt || null,
    };
  } catch {
    return null;
  }
}

export function writeStoredPreferences(
  input: Pick<CookiePreferences, 'preferences' | 'analytics' | 'marketing'>,
): CookiePreferences {
  const now = new Date();
  const expires = new Date(now.getTime() + CONSENT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);

  const preferences: CookiePreferences = {
    schemaVersion: 1,
    policyVersion: CURRENT_COOKIE_POLICY_VERSION,
    necessary: true,
    preferences: Boolean(input.preferences),
    analytics: Boolean(input.analytics),
    marketing: Boolean(input.marketing),
    decidedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Memory fallback
    }
  }

  return preferences;
}

export function clearOptionalCookiesAndStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    // Clear any non-essential keys, without touching auth, csrf, guest tokens, verification
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && (key.startsWith('booking:analytics') || key.startsWith('booking:marketing'))) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}
