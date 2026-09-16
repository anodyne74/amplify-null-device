'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@aws-amplify/ui-react';
import { amplifyTheme } from '@/app/amplify-theme';
import { fetchUserId } from '@/lib/amplify-config';
import type { ThemeModeResolved } from '@/app/theme/themeTokens';

const THEME_MODE_STORAGE_KEY = 'nd-theme-mode';

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
  const [mode, setMode] = useState<ThemeMode>('system');
  const [systemMode, setSystemMode] = useState<ThemeModeResolved>('dark');
  // undefined = still resolving the session; null = confirmed signed out.
  const [userSub, setUserSub] = useState<string | null | undefined>(undefined);
  const resolvedMode = resolveThemeMode(mode, systemMode);

  useEffect(() => {
    let cancelled = false;
    void fetchUserId().then((sub) => {
      if (!cancelled) setUserSub(sub ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Wait until we know whose bucket to read -- reading the unscoped key
  // while a sign-in is still resolving would flash a different user's
  // last-saved theme before this one's own preference (or lack of one) loads.
  useEffect(() => {
    if (userSub === undefined) return;
    const saved = window.localStorage.getItem(getThemeStorageKey(userSub));
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setMode(saved);
    }
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
