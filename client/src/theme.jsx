import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// Light / dark theme with a "follow the system" option. The choice is stored in
// localStorage and applied to <html data-theme> so the CSS variables swap.

const STORAGE_KEY = 'group-hub-theme';
const ThemeContext = createContext(null);

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark' || value === 'system') return value;
  } catch {
    /* storage unavailable — fall back to system */
  }
  return 'system';
}

function resolve(theme) {
  if (theme !== 'system') return theme;
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(readStoredTheme);
  const [resolved, setResolved] = useState(() => resolve(readStoredTheme()));

  useEffect(() => {
    const apply = () => {
      const next = resolve(theme);
      setResolved(next);
      document.documentElement.setAttribute('data-theme', next);
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', next === 'dark' ? '#070b15' : '#0b1020');
    };
    apply();

    if (theme !== 'system' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = resolve(current) === 'dark' ? 'light' : 'dark';
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle, isDark: resolved === 'dark' }),
    [theme, resolved, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
