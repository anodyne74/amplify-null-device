/**
 * A user's own UserSettings (display name, theme, map style) as the browser
 * reads and writes it through the signed-in user's data client.
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export type ThemeModeSetting = 'system' | 'light' | 'dark';
export type MapThemeSetting = 'light' | 'dark' | 'satellite' | 'streets';

export interface UserSettingsRecord {
  id: string;
  userSub: string;
  name?: string | null;
  defaultTheme?: ThemeModeSetting | null;
  mapTheme?: MapThemeSetting | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Get current user's settings record, if it exists.
 */
export async function getUserSettings(userSub: string) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'UserSettings', {
      filter: { userSub: { eq: userSub } },
    });

    if (errors.length > 0) {
      console.error('Errors getting user settings:', errors);
      return { data: null, errors };
    }

    const row = (data as UserSettingsRecord[])[0] || null;
    return { data: row, errors: undefined };
  } catch (error) {
    console.error('Error getting user settings:', error);
    return { data: null, errors: [error] };
  }
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
  }>
) {
  try {
    const current = await getUserSettings(userSub);
    if (current.errors && current.errors.length > 0) {
      return { data: null, errors: current.errors };
    }

    const nowIso = new Date().toISOString();

    if (current.data?.id) {
      const { data, errors } = await getDataClient().models.UserSettings.update({
        id: current.data.id,
        ...updates,
        updatedAt: nowIso,
      });

      if (errors) {
        console.error('Errors updating user settings:', errors);
      }
      return { data, errors };
    }

    const { data, errors } = await getDataClient().models.UserSettings.create({
      userSub,
      ...updates,
      defaultTheme: updates.defaultTheme ?? 'light',
      mapTheme: updates.mapTheme ?? 'light',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    if (errors) {
      console.error('Errors creating user settings:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error upserting user settings:', error);
    return { data: null, errors: [error] };
  }
}
