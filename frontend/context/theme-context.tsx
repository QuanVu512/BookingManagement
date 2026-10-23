'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'smash-arena-theme';
// Figma frames 11:4 and 11:133 (public home + court detail) are light surfaces.
// A saved preference still wins; the toggle keeps dark mode available.
const DEFAULT_THEME: ThemeMode = 'light';

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

function readSavedTheme(): ThemeMode {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(storedTheme) ? storedTheme : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function saveTheme(theme: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Keep the selected theme active for the current page when storage is unavailable.
  }
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME);
  const [isInitialized, setIsInitialized] = useState(false);

  useLayoutEffect(() => {
    const initialTheme = readSavedTheme();
    applyTheme(initialTheme);
    setTheme(initialTheme);
    setIsInitialized(true);
  }, []);

  useLayoutEffect(() => {
    if (isInitialized) applyTheme(theme);
  }, [isInitialized, theme]);

  useEffect(() => {
    const syncStoredTheme = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const storedTheme = event.newValue;
      if (!isThemeMode(storedTheme)) return;
      setTheme(storedTheme);
      applyTheme(storedTheme);
    };

    window.addEventListener('storage', syncStoredTheme);
    return () => window.removeEventListener('storage', syncStoredTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    saveTheme(nextTheme);
    applyTheme(nextTheme);
    setTheme(nextTheme);
  }, [theme]);

  const contextValue = useMemo(
    () => ({ theme, toggleTheme }),
    [theme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
}
