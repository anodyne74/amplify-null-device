'use client';

import { useEffect, useState } from 'react';
import { useCurrentUserId } from '@/lib/use-user-groups';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { fetchUserDisplayName } from '@/lib/amplify-config';
import {
  getUserSettings,
  upsertUserSettings,
  type MapThemeSetting,
  type ThemeModeSetting,
} from '@/lib/userSettings';
import { MAP_THEMES } from '@/lib/mapThemes';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Switch } from '@/app/components/ui/forms/Switch';
import styles from './UserSettingsPage.module.css';

type RoleVariant = 'administrator' | 'operator' | 'customer';

interface UserSettingsPageProps {
  title: string;
  roleVariant: RoleVariant;
}

export default function UserSettingsPage({ title, roleVariant }: UserSettingsPageProps) {
  const userId = useCurrentUserId();
  const { mode, setMode } = useThemeMode();
  const [fallbackDisplayName, setFallbackDisplayName] = useState('');

  const [name, setName] = useState('');
  const [defaultTheme, setDefaultTheme] = useState<ThemeModeSetting>('dark');
  const [mapTheme, setMapTheme] = useState<MapThemeSetting>('light');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void fetchUserDisplayName().then((name) => {
      if (!cancelled) setFallbackDisplayName(name || '');
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    setName(fallbackDisplayName);

    void getUserSettings(userId)
      .then((result) => {
        if (cancelled) return;

        if (!result.data) {
          setName(fallbackDisplayName);
          return;
        }

        setName(result.data.name?.trim() || fallbackDisplayName);
        const loadedTheme = result.data.defaultTheme as ThemeModeSetting | null;
        setDefaultTheme(loadedTheme || 'dark');
        // The saved default is only ever applied to the actual rendered theme when the
        // user hits Save (see handleSave's setMode call) -- it was never re-applied when
        // settings load on a fresh session, so a saved "Light" default silently reverted
        // to whatever AmplifyThemeProvider's own localStorage/system fallback was on the
        // next visit (#80). Apply it here too, once we know what was actually saved.
        if (loadedTheme) {
          setMode(loadedTheme);
        }
        setMapTheme((result.data.mapTheme as MapThemeSetting | null) || 'light');
      })
      .catch(() => {
        // Non-blocking: defaults are already set in local state.
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackDisplayName, userId, setMode]);

  const handleSave = async () => {
    if (!userId) {
      setMessage('Unable to save settings. Please sign in again.');
      return;
    }

    setPending(true);
    setMessage(null);

    const result = await upsertUserSettings(userId, {
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
      <div>
        <h1 className={styles.heading}>{title}</h1>
        <p className={styles.subtext}>{roleLabel} profile and preferences.</p>
      </div>

      <Card>
        <div className={styles.grid}>
          <Field label="Name" htmlFor="settings-name">
            <Input
              id="settings-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your display name"
            />
          </Field>

          <Field label="Default Theme" htmlFor="settings-theme">
            <Switch
              id="settings-theme"
              checked={defaultTheme !== 'light'}
              onChange={(event) => setDefaultTheme(event.target.checked ? 'dark' : 'light')}
              label={defaultTheme !== 'light' ? 'Dark' : 'Light'}
            />
          </Field>

          <Field label="Map Theme" htmlFor="settings-map-theme">
            <Select
              id="settings-map-theme"
              value={mapTheme}
              onChange={(event) => setMapTheme(event.target.value as MapThemeSetting)}
            >
              {MAP_THEMES.map((theme) => (
                <option key={theme.key} value={theme.key}>
                  {theme.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className={styles.actions}>
          <Button type="button" loading={pending} disabled={pending} onClick={() => void handleSave()}>
            {pending ? 'Saving...' : 'Save Settings'}
          </Button>
          {message && <p className={styles.message}>{message}</p>}
        </div>

        <p className={styles.currentTheme}>
          Current theme in app: {mode}
        </p>
      </Card>
    </div>
  );
}
