/**
 * Null Device's own invoice remittance details -- a single, org-wide settings row
 * (not per-user; see the schema comment on OrganizationSettings in amplify/data/resource.ts).
 * Always read/written by the well-known id 'organization'.
 */
import { getDataClient } from '@/lib/data-client';

const ORGANIZATION_SETTINGS_ID = 'organization';

function getOrganizationSettingsModel() {
  const model = (getDataClient().models as unknown as Record<string, unknown>).OrganizationSettings as
    | {
        get: (args: { id: string }) => Promise<{ data?: unknown; errors?: unknown[] }>;
        create: (args: unknown) => Promise<{ data?: unknown; errors?: unknown[] }>;
        update: (args: unknown) => Promise<{ data?: unknown; errors?: unknown[] }>;
      }
    | undefined;

  if (!model) {
    return {
      model: null,
      error: new Error(
        'OrganizationSettings model is not available in the current backend schema. Deploy backend changes and refresh amplify outputs.'
      ),
    };
  }

  return { model, error: null };
}

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
 * Get the organization's settings row, if it's been created yet.
 */
export async function getOrganizationSettings() {
  try {
    const { model, error: modelError } = getOrganizationSettingsModel();
    if (!model) {
      return { data: null, errors: [modelError] };
    }

    const { data, errors } = await model.get({ id: ORGANIZATION_SETTINGS_ID });
    if (errors) {
      console.error('Errors getting organization settings:', errors);
      return { data: null, errors };
    }

    return { data: (data as OrganizationSettingsRecord | null) ?? null, errors };
  } catch (error) {
    console.error('Error getting organization settings:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Create or update the organization's settings row.
 */
export async function upsertOrganizationSettings(updates: OrganizationSettingsUpdates) {
  try {
    const { model, error: modelError } = getOrganizationSettingsModel();
    if (!model) {
      return { data: null, errors: [modelError] };
    }

    const current = await getOrganizationSettings();
    if (current.errors && current.errors.length > 0) {
      return { data: null, errors: current.errors };
    }

    const nowIso = new Date().toISOString();

    if (current.data) {
      const { data, errors } = await model.update({
        id: ORGANIZATION_SETTINGS_ID,
        ...updates,
        updatedAt: nowIso,
      });

      if (errors) {
        console.error('Errors updating organization settings:', errors);
      }
      return { data, errors };
    }

    const { data, errors } = await model.create({
      id: ORGANIZATION_SETTINGS_ID,
      ...updates,
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    if (errors) {
      console.error('Errors creating organization settings:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error saving organization settings:', error);
    return { data: null, errors: [error] };
  }
}
