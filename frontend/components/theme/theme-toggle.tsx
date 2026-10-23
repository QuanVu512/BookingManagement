'use client';

import { useTheme } from '../../context/theme-context';

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? ' theme-toggle-compact' : ''}`}
      onClick={toggleTheme}
      aria-label={`Chuyển sang giao diện ${nextTheme === 'light' ? 'sáng' : 'tối'}`}
      aria-pressed={theme === 'light'}
      title={`Giao diện ${theme === 'dark' ? 'tối' : 'sáng'}`}
    >
      <svg
        className="theme-bulb"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M9 18h6m-5 3h4M9 15.5c0-1.2-.8-2-1.6-2.9A6 6 0 1 1 16.6 12.6c-.8.9-1.6 1.7-1.6 2.9V18H9z" />
        <path
          className="theme-bulb-rays"
          d="M12 1v1M3.5 4.5l.8.8M20.5 4.5l-.8.8M1 11h1m20 0h1"
        />
      </svg>
      {!compact && (
        <span>{theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}</span>
      )}
    </button>
  );
}
