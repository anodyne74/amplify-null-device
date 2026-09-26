'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@aws-amplify/ui-react';
import { Hub } from 'aws-amplify/utils';
import { amplifyTheme } from '@/app/amplify-theme';
import { fetchUserId } from '@/lib/amplify-config';
import { getUserSettings } from '@/lib/userSettings';
import type { ThemeModeResolved } from '@/app/theme/themeTokens';

const THEME_MODE_STORAGE_KEY = 'nd-theme-mode';

/**
 * sessionStorage marker holding the sub whose saved UserSettings.defaultTheme
 * has already been applied in this tab. The saved default wins once per
 * sign-in; after that, in-session changes (the theme toggle) stick, even
 * across full page loads such as opening a route (#307).
 */
const SAVED_DEFAULT_APPLIED_KEY = 'nd-theme-default-applied';

/**
 * Scopes the persisted theme choice to the signed-in user's Cognito sub, so
 * one account's theme preference doesn't bleed into another account signed
 * into the same browser (#88) -- localStorage is shared per-origin, not
 * per-user. Falls back to a single unscoped bucket while signed out.
 */
function getThemeStorageKey(userSub: string | null | undefined) {
  return userSub ? `${THEME_MODE_STORAGE_KEY}:${userSub}` : THEME_MODE_STORAGE_KEY;
}

export type ThemeMode = 'system' | 'light' | 'dark';

/** The theme for anyone who hasn't chosen one -- regardless of OS preference (#307). */
const DEFAULT_THEME_MODE: ThemeMode = 'light';

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

interface ThemeModeContextValue {
  mode: ThemeMode;
  resolvedMode: ThemeModeResolved;
  setMode: (mode: ThemeMode) => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue | undefined>(undefined);

function getSystemPrefersLight() {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches;
}

export function resolveThemeMode(mode: ThemeMode, systemMode: ThemeModeResolved = 'dark'): ThemeModeResolved {
  if (mode === 'system') {
    return systemMode;
  }
  return mode;
}

export default function AmplifyThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [systemMode, setSystemMode] = useState<ThemeModeResolved>('dark');
  // undefined = still resolving the session; null = confirmed signed out.
  const [userSub, setUserSub] = useState<string | null | undefined>(undefined);
  const resolvedMode = resolveThemeMode(mode, systemMode);

  // Signing in and out happens client-side, without remounting this provider,
  // so re-resolve the user on every auth change rather than only on mount (#307).
  useEffect(() => {
    let cancelled = false;
    const resolveUser = () => {
      void fetchUserId().then((sub) => {
        if (!cancelled) setUserSub(sub ?? null);
      });
    };

    resolveUser();

    const stopListening = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'signedIn') {
        window.sessionStorage.removeItem(SAVED_DEFAULT_APPLIED_KEY);
        resolveUser();
      } else if (payload.event === 'signedOut') {
        window.sessionStorage.removeItem(SAVED_DEFAULT_APPLIED_KEY);
        setUserSub(null);
      }
    });

    return () => {
      cancelled = true;
      stopListening();
    };
  }, []);

  // Wait until we know whose bucket to read -- reading the unscoped key
  // while a sign-in is still resolving would flash a different user's
  // last-saved theme before this one's own preference (or lack of one) loads.
  // Then, once per sign-in, let the user's saved default override it.
  useEffect(() => {
    if (userSub === undefined) return;
    const saved = window.localStorage.getItem(getThemeStorageKey(userSub));
    setMode(isThemeMode(saved) ? saved : DEFAULT_THEME_MODE);

    if (!userSub || window.sessionStorage.getItem(SAVED_DEFAULT_APPLIED_KEY) === userSub) return;
    let cancelled = false;

    void getUserSettings(userSub).then((result) => {
      // Non-blocking: keep the browser's last-used mode if settings can't be loaded.
      if (cancelled || (result.errors && result.errors.length > 0)) return;
      window.sessionStorage.setItem(SAVED_DEFAULT_APPLIED_KEY, userSub);
      setMode(result.data?.defaultTheme || DEFAULT_THEME_MODE);
    });

    return () => {
      cancelled = true;
    };
  }, [userSub]);

  useEffect(() => {
    if (userSub === undefined) return;
    window.localStorage.setItem(getThemeStorageKey(userSub), mode);
  }, [mode, userSub]);

  useEffect(() => {
    const updateSystemMode = () => {
      setSystemMode(getSystemPrefersLight() ? 'light' : 'dark');
    };

    updateSystemMode();

    if (typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateSystemMode);
      return () => mediaQuery.removeEventListener('change', updateSystemMode);
    }

    if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(updateSystemMode);
      return () => mediaQuery.removeListener(updateSystemMode);
    }

    return;
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedMode);
    document.documentElement.style.colorScheme = resolvedMode;
  }, [resolvedMode]);

  const contextValue = useMemo(() => ({ mode, resolvedMode, setMode }), [mode, resolvedMode]);

  return (
    <ThemeModeContext.Provider value={contextValue}>
      <ThemeProvider theme={amplifyTheme} colorMode={mode}>
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useThemeMode() {
  const context = useContext(ThemeModeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within AmplifyThemeProvider');
  }
  return context;
}
