'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CookiePreferencesContext,
  type CookiePreferencesContextValue,
} from '../hooks/use-cookie-preferences';
import {
  type CookiePreferences,
  DEFAULT_PREFERENCES,
} from '../model/consent';
import {
  readStoredPreferences,
  writeStoredPreferences,
  clearOptionalCookiesAndStorage,
} from '../api/preference-storage';
import { CookieBanner } from './cookie-banner';
import { CookiePreferencesDialog } from './cookie-preferences-dialog';
import { OptionalTrackers } from './optional-trackers';

interface CookiePreferencesProviderProps {
  children: React.ReactNode;
}

export const CookiePreferencesProvider: React.FC<CookiePreferencesProviderProps> = ({
  children,
}) => {
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [hasDecided, setHasDecided] = useState<boolean>(true); // default true on server to avoid banner flash/hydration mismatch
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
    const stored = readStoredPreferences();
    if (stored) {
      setPreferences(stored);
      setHasDecided(true);
    } else {
      setHasDecided(false);
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === 'booking:cookie-consent') {
        const updated = readStoredPreferences();
        if (updated) {
          setPreferences(updated);
          setHasDecided(true);
        } else {
          setPreferences(DEFAULT_PREFERENCES);
          setHasDecided(false);
        }
      }
    };

    window.addEventListener('storage', handleStorageEvent);
    return () => window.removeEventListener('storage', handleStorageEvent);
  }, []);

  const acceptAll = useCallback(() => {
    const updated = writeStoredPreferences({
      preferences: true,
      analytics: true,
      marketing: true,
    });
    setPreferences(updated);
    setHasDecided(true);
    setIsDialogOpen(false);
  }, []);

  const rejectOptional = useCallback(() => {
    const updated = writeStoredPreferences({
      preferences: false,
      analytics: false,
      marketing: false,
    });
    setPreferences(updated);
    setHasDecided(true);
    setIsDialogOpen(false);
    clearOptionalCookiesAndStorage();
  }, []);

  const saveCustomPreferences = useCallback(
    (input: { preferences?: boolean; analytics?: boolean; marketing?: boolean }) => {
      const updated = writeStoredPreferences({
        preferences: Boolean(input.preferences),
        analytics: Boolean(input.analytics),
        marketing: Boolean(input.marketing),
      });
      setPreferences(updated);
      setHasDecided(true);
      setIsDialogOpen(false);
      if (!input.analytics && !input.marketing) {
        clearOptionalCookiesAndStorage();
      }
    },
    [],
  );

  const revokePreferences = useCallback(() => {
    const updated = writeStoredPreferences({
      preferences: false,
      analytics: false,
      marketing: false,
    });
    setPreferences(updated);
    setHasDecided(false);
    setIsDialogOpen(false);
    clearOptionalCookiesAndStorage();
  }, []);

  const openPreferencesDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const closePreferencesDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const contextValue: CookiePreferencesContextValue = {
    preferences,
    hasDecided,
    isMounted,
    isDialogOpen,
    acceptAll,
    rejectOptional,
    saveCustomPreferences,
    revokePreferences,
    openPreferencesDialog,
    closePreferencesDialog,
  };

  return (
    <CookiePreferencesContext.Provider value={contextValue}>
      {children}
      <CookieBanner />
      <CookiePreferencesDialog />
      <OptionalTrackers />
    </CookiePreferencesContext.Provider>
  );
};
