'use client';

import { createContext, useContext } from 'react';
import type { CookiePreferences } from '../model/consent';

export interface CookiePreferencesContextValue {
  preferences: CookiePreferences;
  hasDecided: boolean;
  isMounted: boolean;
  isDialogOpen: boolean;
  acceptAll: () => void;
  rejectOptional: () => void;
  saveCustomPreferences: (prefs: {
    preferences?: boolean;
    analytics?: boolean;
    marketing?: boolean;
  }) => void;
  revokePreferences: () => void;
  openPreferencesDialog: () => void;
  closePreferencesDialog: () => void;
}

export const CookiePreferencesContext = createContext<CookiePreferencesContextValue | null>(null);

export function useCookiePreferences(): CookiePreferencesContextValue {
  const context = useContext(CookiePreferencesContext);
  if (!context) {
    throw new Error('useCookiePreferences must be used within a CookiePreferencesProvider');
  }
  return context;
}
