'use client';

import React, { useContext } from 'react';
import { CookiePreferencesContext } from '../../cookie-consent/hooks/use-cookie-preferences';

interface CookiePreferencesTriggerProps {
  className?: string;
  variant?: 'button' | 'link';
}

export const CookiePreferencesTrigger: React.FC<CookiePreferencesTriggerProps> = ({
  className,
  variant = 'link',
}) => {
  const context = useContext(CookiePreferencesContext);
  const openPreferencesDialog = context?.openPreferencesDialog ?? (() => {});

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={openPreferencesDialog}
        className={className}
        aria-haspopup="dialog"
      >
        Tùy chọn Cookie
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPreferencesDialog}
      className={className}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        font: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        textDecoration: 'underline',
      }}
      aria-haspopup="dialog"
    >
      Tùy chọn Cookie
    </button>
  );
};
