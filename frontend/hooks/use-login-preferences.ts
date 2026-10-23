'use client';

import { useEffect, useRef, useState } from 'react';
import { AUTH_LIMITS } from '../lib/auth-validation';

export const LOGIN_IDENTIFIER_KEY = 'smash-arena:login-identifier';

function readIdentifier() {
  try {
    const identifier = window.localStorage.getItem(LOGIN_IDENTIFIER_KEY) ?? '';
    return identifier.length <= AUTH_LIMITS.identifierMax ? identifier : '';
  } catch {
    return '';
  }
}

export function useLoginPreferences(onRestore: (identifier: string) => void) {
  const [rememberIdentifier, setRememberIdentifier] = useState(false);
  const restore = useRef(onRestore);
  useEffect(() => {
    const identifier = readIdentifier();
    if (!identifier) return;
    restore.current(identifier);
    setRememberIdentifier(true);
  }, []);

  function saveIdentifier(identifier: string) {
    try {
      if (rememberIdentifier && identifier.trim())
        window.localStorage.setItem(LOGIN_IDENTIFIER_KEY, identifier);
      else window.localStorage.removeItem(LOGIN_IDENTIFIER_KEY);
    } catch {
      // Storage is optional; authentication still works when it is unavailable.
    }
  }
  return { rememberIdentifier, setRememberIdentifier, saveIdentifier };
}
