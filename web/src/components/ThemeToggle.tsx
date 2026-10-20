import { useEffect, useState } from 'react';

export type Theme = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'vc-theme';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: 'Tema: sistemska', light: 'Tema: svetla', dark: 'Tema: tamna' };
const ICON: Record<Theme, string> = { system: '◐', light: '☀', dark: '☾' };

function readTheme(): Theme {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

/** Applies the theme as `data-theme` on <html>; "system" follows prefers-color-scheme (see web/public/theme.js). */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  try {
    if (theme === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // storage unavailable (private mode): theme still applies for this visit
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => applyTheme(theme), [theme]);
  const next = NEXT[theme];
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={`${LABEL[theme]} (promeni u: ${LABEL[next].replace('Tema: ', '')})`}
      title={LABEL[theme]}
    >
      <span aria-hidden="true">{ICON[theme]}</span>
    </button>
  );
}
