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
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      {!compact && (
        <span>{theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}</span>
      )}
    </button>
  );
}
