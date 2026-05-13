'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import {
  getUserSettings,
  upsertUserSettings,
  type MapThemeSetting,
  type ThemeModeSetting,
} from '@/lib/queries';
import { MAP_THEMES } from '@/lib/mapThemes';
import styles from './UserSettingsPage.module.css';

type RoleVariant = 'administrator' | 'operator' | 'customer';

interface UserSettingsPageProps {
  title: string;
  roleVariant: RoleVariant;
}

export default function UserSettingsPage({ title, roleVariant }: UserSettingsPageProps) {
  const { user } = useAuthenticator();
  const { mode, setMode } = useThemeMode();

  const [name, setName] = useState('');
  const [defaultTheme, setDefaultTheme] = useState<ThemeModeSetting>('system');
  const [mapTheme, setMapTheme] = useState<MapThemeSetting>('light');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getUserSettings(user.userId)
      .then((result) => {
        if (cancelled || !result.data) return;

        setName(result.data.name || '');
        setDefaultTheme((result.data.defaultTheme as ThemeModeSetting | null) || 'system');
        setMapTheme((result.data.mapTheme as MapThemeSetting | null) || 'light');
      })
      .catch(() => {
        // Non-blocking: defaults are already set in local state.
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  const handleSave = async () => {
    if (!user?.userId) {
      setMessage('Unable to save settings. Please sign in again.');
      return;
    }

    setPending(true);
    setMessage(null);

    const result = await upsertUserSettings(user.userId, {
      name: name.trim() || undefined,
      defaultTheme,
      mapTheme,
    });

    if (result.errors && result.errors.length > 0) {
      setMessage('Failed to save settings. Please try again.');
      setPending(false);
      return;
    }

    setMode(defaultTheme);
    setMessage('Settings saved.');
    setPending(false);
  };

  const roleLabel = roleVariant === 'administrator' ? 'Administrator' : roleVariant === 'operator' ? 'Operator' : 'Customer';

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>{title}</h1>
      <p className={styles.subtext}>{roleLabel} profile and preferences.</p>

      <div className={styles.panel}>
        <div className={styles.grid}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-name">
              Name
            </label>
            <input
              id="settings-name"
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your display name"
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-theme">
              Default Theme
            </label>
            <select
              id="settings-theme"
              className={styles.select}
              value={defaultTheme}
              onChange={(event) => setDefaultTheme(event.target.value as ThemeModeSetting)}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="settings-map-theme">
              Map Theme
            </label>
            <select
              id="settings-map-theme"
              className={styles.select}
              value={mapTheme}
              onChange={(event) => setMapTheme(event.target.value as MapThemeSetting)}
            >
              {MAP_THEMES.map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.button} disabled={pending} onClick={() => void handleSave()}>
            {pending ? 'Saving...' : 'Save Settings'}
          </button>
          {message && <p className={styles.message}>{message}</p>}
        </div>

        <p className={styles.subtext}>
          Current theme in app: {mode}
        </p>
      </div>
    </div>
  );
}
