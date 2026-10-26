export type ConsentCategory = 'necessary' | 'preferences' | 'analytics' | 'marketing';

export interface CookiePreferences {
  schemaVersion: 1;
  policyVersion: string;
  necessary: true;
  preferences: boolean;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string | null;
  expiresAt: string | null;
}

export const CURRENT_CONSENT_SCHEMA_VERSION = 1;
export const CURRENT_COOKIE_POLICY_VERSION = 'v1.0';
export const CONSENT_STORAGE_KEY = 'booking:cookie-consent';
export const CONSENT_VALIDITY_DAYS = 180;

export const DEFAULT_PREFERENCES: CookiePreferences = {
  schemaVersion: 1,
  policyVersion: CURRENT_COOKIE_POLICY_VERSION,
  necessary: true,
  preferences: false,
  analytics: false,
  marketing: false,
  decidedAt: null,
  expiresAt: null,
};
