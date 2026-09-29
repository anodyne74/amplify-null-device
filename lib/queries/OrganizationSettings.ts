/**
 * Null Device's own invoice remittance details -- a single, org-wide settings row
 * (not per-user; see the schema comment on OrganizationSettings in amplify/data/resource.ts).
 * Always read/written by the well-known id 'organization'. Returns its data or
 * throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';

const ORGANIZATION_SETTINGS_ID = 'organization';

export interface OrganizationSettingsRecord {
  id: string;
  companyName?: string | null;
  abn?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentAccountName?: string | null;
  bsb?: string | null;
  accountNumber?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type OrganizationSettingsUpdates = Partial<{
  companyName: string;
  abn: string;
  phone: string;
  address: string;
  paymentAccountName: string;
  bsb: string;
  accountNumber: string;
}>;

/**
 * Get the organization's settings row; null if it hasn't been created yet.
 */
export async function getOrganizationSettings() {
  return withDataError('Failed to load pay-to details.', readOrganizationSettings);
}

async function readOrganizationSettings() {
  return resultData(
    await getDataClient().models.OrganizationSettings.get({ id: ORGANIZATION_SETTINGS_ID })
  ) as OrganizationSettingsRecord | null;
}

/**
 * Create or update the organization's settings row.
 */
export async function upsertOrganizationSettings(updates: OrganizationSettingsUpdates) {
  return withDataError('Failed to save pay-to details.', async () => {
    const model = getDataClient().models.OrganizationSettings;
    const current = await readOrganizationSettings();
    const nowIso = new Date().toISOString();

    if (current) {
      return resultData(await model.update({ id: ORGANIZATION_SETTINGS_ID, ...updates, updatedAt: nowIso }));
    }
    return resultData(
      await model.create({ id: ORGANIZATION_SETTINGS_ID, ...updates, createdAt: nowIso, updatedAt: nowIso })
    );
  });
}
