import {useEffect, useState} from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

/** Per-device preference, so it lives in localStorage rather than in the synced data. */
const KEY = 'personal-dashboard/theme';

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice) {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

export function useTheme(): [ThemeChoice, (t: ThemeChoice) => void] {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try {
      if (theme === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, theme);
    } catch {
      // Storage blocked: the choice just won't persist.
    }
  }, [theme]);
  return [theme, setTheme];
}
