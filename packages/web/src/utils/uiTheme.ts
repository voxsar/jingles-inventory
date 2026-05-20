export type UITheme = 'dark' | 'light';

const UI_THEME_STORAGE_KEY = 'jingles_ui_theme';

export function getStoredUITheme(): UITheme {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const stored = window.localStorage.getItem(UI_THEME_STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

export function persistUITheme(theme: UITheme) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(UI_THEME_STORAGE_KEY, theme);
}

export function toggleUITheme(theme: UITheme): UITheme {
  return theme === 'dark' ? 'light' : 'dark';
}
