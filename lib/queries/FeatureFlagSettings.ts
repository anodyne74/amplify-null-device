/**
 * The admin portal's side of Feature Flags (ADR 0005). Administrators read the
 * stored settings directly; every change goes through /api/admin/feature-flags,
 * which also writes the AuditLog entry -- AppSync gives administrators no write
 * access to FeatureFlagSetting.
 */
import { callApi } from '@/lib/apiClient';
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';
import type { FeatureFlagChange, FeatureFlagName, FeatureFlagSettingRecord } from '@/lib/featureFlags';

/** Every stored flag setting, including any for flags no longer registered. */
export async function listFeatureFlagSettings() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'FeatureFlagSetting');
    if (errors.length > 0) {
      console.error('Errors listing feature flag settings:', errors);
      return { data: [] as FeatureFlagSettingRecord[], errors };
    }
    return { data: data as FeatureFlagSettingRecord[], errors: undefined };
  } catch (error) {
    console.error('Error listing feature flag settings:', error);
    return { data: [] as FeatureFlagSettingRecord[], errors: [error] };
  }
}

/** Applies one change and resolves to the flag's stored setting afterwards. Throws ApiError on failure. */
export async function changeFeatureFlag(name: FeatureFlagName, change: FeatureFlagChange) {
  const result = await callApi<{ setting: FeatureFlagSettingRecord | null }>('/api/admin/feature-flags', {
    name,
    ...change,
  });
  return result.setting;
}
