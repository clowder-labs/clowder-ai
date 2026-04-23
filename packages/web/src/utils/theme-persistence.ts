/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

export type ThemeType = 'warm' | 'business' | 'dark';

export const DEFAULT_THEME: ThemeType = 'business';
export const THEME_STORAGE_KEY = 'office-claw-theme';
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function normalizeThemeValue(value: string | null | undefined): ThemeType | null {
  if (!value) return null;
  if (value === 'default') return DEFAULT_THEME;
  return value === 'warm' || value === 'business' || value === 'dark' ? value : null;
}

export function readThemeFromCookieString(cookieSource: string | null | undefined): ThemeType | null {
  if (!cookieSource) return null;

  const prefix = `${THEME_STORAGE_KEY}=`;
  for (const segment of cookieSource.split(';')) {
    const trimmed = segment.trim();
    if (!trimmed.startsWith(prefix)) continue;

    try {
      return normalizeThemeValue(decodeURIComponent(trimmed.slice(prefix.length)));
    } catch {
      return null;
    }
  }

  return null;
}

export function readThemeFromDocument(): ThemeType | null {
  if (typeof document !== 'object') return null;
  return normalizeThemeValue(document.documentElement.dataset.uiTheme);
}

export function readThemeFromBrowserStorage(): ThemeType | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    return normalizeThemeValue(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readThemeFromBrowserCookie(): ThemeType | null {
  if (typeof document !== 'object') return null;
  return readThemeFromCookieString(document.cookie);
}

function writeThemeToBrowserStorage(theme: ThemeType) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep runtime theme usable.
  }
}

function writeThemeToBrowserCookie(theme: ThemeType) {
  if (typeof document !== 'object') return;

  try {
    document.cookie =
      `${THEME_STORAGE_KEY}=${encodeURIComponent(theme)}; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  } catch {
    // Ignore cookie failures and keep runtime theme usable.
  }
}

export function persistTheme(theme: ThemeType) {
  writeThemeToBrowserStorage(theme);
  writeThemeToBrowserCookie(theme);
}

export function resolvePersistedTheme(): ThemeType {
  const cookieTheme = readThemeFromBrowserCookie();
  if (cookieTheme) {
    writeThemeToBrowserStorage(cookieTheme);
    return cookieTheme;
  }

  const storageTheme = readThemeFromBrowserStorage();
  if (storageTheme) {
    persistTheme(storageTheme);
    return storageTheme;
  }

  return readThemeFromDocument() ?? DEFAULT_THEME;
}

export function buildThemeBootstrapScript(): string {
  return `(() => {
    try {
      var key = ${JSON.stringify(THEME_STORAGE_KEY)};
      var defaultTheme = ${JSON.stringify(DEFAULT_THEME)};
      var theme = '';
      var cookieParts = document.cookie ? document.cookie.split(';') : [];

      for (var i = 0; i < cookieParts.length; i += 1) {
        var part = cookieParts[i] ? cookieParts[i].trim() : '';
        if (part.indexOf(key + '=') !== 0) continue;
        try {
          theme = decodeURIComponent(part.slice(key.length + 1));
        } catch (_) {
          theme = '';
        }
        break;
      }

      if (!theme) {
        try {
          theme = localStorage.getItem(key) || '';
        } catch (_) {
          theme = '';
        }
      }

      if (theme !== 'warm' && theme !== 'business' && theme !== 'dark') {
        theme = theme === 'default' ? defaultTheme : (document.documentElement.dataset.uiTheme || defaultTheme);
      }

      document.documentElement.dataset.uiTheme = theme;

      try {
        localStorage.setItem(key, theme);
      } catch (_) {}

      document.cookie = key + '=' + encodeURIComponent(theme) + '; path=/; max-age=${THEME_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax';
    } catch (_) {
      document.documentElement.dataset.uiTheme = ${JSON.stringify(DEFAULT_THEME)};
    }
  })();`;
}
