/**
 * A user's own UserSettings (display name, theme, map style, welcome card
 * dismissal) as the browser reads and writes it through the signed-in user's
 * data client.
 *
 * Both functions return their data or throw a DataError (lib/graphqlResult.ts);
 * a user with no saved settings is null, not an error.
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';

export type ThemeModeSetting = 'system' | 'light' | 'dark';
export type MapThemeSetting = 'light' | 'dark' | 'satellite' | 'streets';

export interface UserSettingsRecord {
  id: string;
  userSub: string;
  name?: string | null;
  defaultTheme?: ThemeModeSetting | null;
  mapTheme?: MapThemeSetting | null;
  /** When the user dismissed the customer Dashboard welcome card; unset until then. */
  welcomeDismissedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Get current user's settings record, or null when they haven't saved any.
 */
export async function getUserSettings(userSub: string) {
  return withDataError('Failed to load settings.', async () => {
    const rows = resultData(
      await listAll(getDataClient(), 'UserSettings', { filter: { userSub: { eq: userSub } } })
    ) as UserSettingsRecord[] | null;
    return rows?.[0] ?? null;
  });
}

/**
 * Create or update settings for the provided userSub.
 */
export async function upsertUserSettings(
  userSub: string,
  updates: Partial<{
    name: string;
    defaultTheme: ThemeModeSetting;
    mapTheme: MapThemeSetting;
    welcomeDismissedAt: string;
  }>
) {
  const current = await getUserSettings(userSub);

  return withDataError('Failed to save settings.', async () => {
    const nowIso = new Date().toISOString();

    if (current?.id) {
      return resultData(
        await getDataClient().models.UserSettings.update({
          id: current.id,
          ...updates,
          updatedAt: nowIso,
        })
      );
    }

    return resultData(
      await getDataClient().models.UserSettings.create({
        userSub,
        ...updates,
        defaultTheme: updates.defaultTheme ?? 'light',
        mapTheme: updates.mapTheme ?? 'light',
        createdAt: nowIso,
        updatedAt: nowIso,
      })
    );
  });
}
