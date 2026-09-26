/**
 * GraphQL-like query helpers for Amplify Data
 * These utilities encapsulate the data fetching patterns and enable type-safe operations
 */

import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

function getClient() {
  return getDataClient();
}

function getUserSettingsModel() {
  const model = (getClient().models as unknown as Record<string, unknown>).UserSettings as
    | {
        list: (args: unknown) => Promise<{ data?: unknown[]; errors?: unknown[] }>;
        create: (args: unknown) => Promise<{ data?: unknown; errors?: unknown[] }>;
        update: (args: unknown) => Promise<{ data?: unknown; errors?: unknown[] }>;
      }
    | undefined;

  if (!model) {
    return {
      model: null,
      error: new Error(
        'UserSettings model is not available in the current backend schema. Deploy backend changes and refresh amplify outputs.'
      ),
    };
  }

  return { model, error: null };
}

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
    const { model, error: modelError } = getUserSettingsModel();
    if (!model) {
      return { data: null, errors: [modelError] };
    }

    const { data, errors } = await listAll(getClient(), 'UserSettings', {
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
    const { model, error: modelError } = getUserSettingsModel();
    if (!model) {
      return { data: null, errors: [modelError] };
    }

    const current = await getUserSettings(userSub);
    if (current.errors && current.errors.length > 0) {
      return { data: null, errors: current.errors };
    }

    const nowIso = new Date().toISOString();

    if (current.data?.id) {
      const { data, errors } = await model.update({
        id: current.data.id,
        ...updates,
        updatedAt: nowIso,
      });

      if (errors) {
        console.error('Errors updating user settings:', errors);
      }
      return { data, errors };
    }

    const { data, errors } = await model.create({
      userSub,
      ...updates,
      defaultTheme: updates.defaultTheme ?? 'system',
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
