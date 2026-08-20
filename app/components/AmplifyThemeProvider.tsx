'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ThemeProvider } from '@aws-amplify/ui-react';
import { amplifyTheme } from '@/app/amplify-theme';
import type { ThemeModeResolved } from '@/app/theme/themeTokens';

const THEME_MODE_STORAGE_KEY = 'nd-theme-mode';

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
  const resolvedMode = resolveThemeMode(mode, systemMode);

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setMode(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  }, [mode]);

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
