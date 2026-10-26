'use client';

import React from 'react';
import { useCookiePreferences } from '../hooks/use-cookie-preferences';

/**
 * OptionalTrackers Component:
 * Controls the gating and execution of non-essential third-party analytics/marketing scripts.
 * In accordance with Phase 3 & hard constraints:
 * - Does NOT import any demo or unverified SDKs.
 * - Tracks whether analytics or marketing consent has been explicitly granted.
 * - If consent is withdrawn, ensures no non-essential requests are initialized.
 */
export const OptionalTrackers: React.FC = () => {
  const { preferences, isMounted } = useCookiePreferences();

  if (!isMounted) return null;

  // The active vendor registry is currently empty as per audit findings and owner decision O06.
  // No trackers will be loaded unless explicitly configured and consented.
  if (!preferences.analytics && !preferences.marketing) {
    return null;
  }

  return null;
};
