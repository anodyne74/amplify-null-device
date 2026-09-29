/**
 * The admin portal's side of Feature Flags (ADR 0005). Administrators read the
 * stored settings directly; every change goes through /api/admin/feature-flags,
 * which also writes the AuditLog entry -- AppSync gives administrators no write
 * access to FeatureFlagSetting.
 */
import { callApi } from '@/lib/apiClient';
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';
import type { FeatureFlagChange, FeatureFlagName, FeatureFlagSettingRecord } from '@/lib/featureFlags';

/** Every stored flag setting, including any for flags no longer registered. Throws a DataError. */
export async function listFeatureFlagSettings() {
  return withDataError('Failed to load feature flags.', async () =>
    (resultData(await listAll(getDataClient(), 'FeatureFlagSetting')) ?? []) as FeatureFlagSettingRecord[]
  );
}

/** Applies one change and resolves to the flag's stored setting afterwards. Throws ApiError on failure. */
export async function changeFeatureFlag(name: FeatureFlagName, change: FeatureFlagChange) {
  const result = await callApi<{ setting: FeatureFlagSettingRecord | null }>('/api/admin/feature-flags', {
    name,
    ...change,
  });
  return result.setting;
}
