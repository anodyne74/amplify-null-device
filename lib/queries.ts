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

/**
 * Fetch invoices for a single customer (admin customers panel — onboarding checklist).
 */
export async function listCustomerInvoices(customerId: string) {
  try {
    const { data, errors } = await listAll(getClient(), 'Invoice', {
      filter: { customerId: { eq: customerId } },
    });

    if (errors.length > 0) {
      console.error('Errors fetching customer invoices:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing customer invoices:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Fetch all invoices for administrators/operators.
 */
export async function listInvoices(options?: { status?: 'draft' | 'sent' | 'paid' }) {
  try {
    const { data, errors } = await listAll(getClient(), 'Invoice');

    if (errors.length > 0) {
      console.error('Errors fetching invoices:', errors);
      return { data: [], errors };
    }

    const filtered = options?.status ? data.filter((invoice) => invoice.status === options.status) : data;

    return { data: filtered, errors: undefined };
  } catch (error) {
    console.error('Error listing invoices:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Fetch a specific invoice with its line items
 */
export async function getInvoiceWithLineItems(invoiceId: string) {
  try {
    const { data: invoice, errors: invoiceErrors } = await getClient().models.Invoice.get({
      id: invoiceId,
    });

    if (invoiceErrors) {
      console.error('Errors fetching invoice:', invoiceErrors);
      return { invoice: null, lineItems: [], errors: invoiceErrors };
    }

    if (!invoice) {
      return { invoice: null, lineItems: [], errors: [] };
    }

    // Fetch line items for this invoice
    const { data: lineItems, errors: lineItemsErrors } = await listAll(getClient(), 'LineItem', {
      filter: { invoiceId: { eq: invoiceId } },
    });

    if (lineItemsErrors.length > 0) {
      console.error('Errors fetching line items:', lineItemsErrors);
    }

    return { invoice, lineItems, errors: lineItemsErrors };
  } catch (error) {
    console.error('Error getting invoice with line items:', error);
    return { invoice: null, lineItems: [], errors: [error] };
  }
}

/**
 * Create an invoice for a customer.
 */
export async function createInvoice(input: {
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  periodStartDate?: string;
  periodEndDate?: string;
  totalAmount: number;
  gstAmount?: number;
  status: 'draft' | 'sent' | 'paid';
  routeId?: string;
  pdfS3Key?: string;
  importedAt?: string;
}) {
  try {
    const { data, errors } = await getClient().models.Invoice.create(input);

    if (errors) {
      console.error('Errors creating invoice:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating invoice:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Update invoice lifecycle and totals.
 */
export async function updateInvoice(
  invoiceId: string,
  updates: Partial<{
    invoiceNumber: string;
    invoiceDate: string;
    periodStartDate: string;
    periodEndDate: string;
    totalAmount: number;
    gstAmount: number;
    status: 'draft' | 'sent' | 'paid';
    routeId: string | null;
    pdfS3Key: string;
    emailSentAt: string | null;
    importedAt: string | null;
  }>
) {
  try {
    const { data, errors } = await getClient().models.Invoice.update({
      id: invoiceId,
      ...updates,
    });

    if (errors) {
      console.error('Errors updating invoice:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating invoice:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Deletes an invoice and its LineItems. Callers are expected to only allow
 * this for invoices that haven't been sent (draft, no emailSentAt) — a sent
 * or paid invoice is a record that shouldn't disappear from history.
 */
export async function deleteInvoice(invoiceId: string) {
  try {
    const client = getClient();
    const { data: lineItems, errors: lineItemListErrors } = await listAll(client, 'LineItem', {
      filter: { invoiceId: { eq: invoiceId } },
    });

    if (lineItemListErrors && lineItemListErrors.length > 0) {
      console.error('Errors fetching invoice line items for deletion:', lineItemListErrors);
      return { data: null, errors: lineItemListErrors };
    }

    const lineItemDeletes = await Promise.all(
      ((lineItems as Array<{ id: string }>) || []).map((lineItem) => client.models.LineItem.delete({ id: lineItem.id }))
    );

    const childErrors = lineItemDeletes.flatMap((result) => result.errors || []);
    if (childErrors.length > 0) {
      console.error('Errors deleting invoice line items:', childErrors);
      return { data: null, errors: childErrors };
    }

    const { data, errors } = await client.models.Invoice.delete({ id: invoiceId });

    if (errors) {
      console.error('Errors deleting invoice:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Convenience helper — saves the S3 key of an uploaded PDF to the invoice record.
 */
export async function updateInvoicePdfKey(invoiceId: string, pdfS3Key: string) {
  return updateInvoice(invoiceId, { pdfS3Key });
}

/**
 * Create a line item on an invoice.
 * customerId MUST be the owning customer's identity (sub) so the tenant-based
 * ownerDefinedIn('customerId') authorization rule grants customer read access.
 */
export async function createLineItem(input: {
  invoiceId: string;
  routeId?: string;
  customerId: string;
  description: string;
  quantity?: number;
  ratePerUnit: number;
  amount: number;
  viewerSubs?: string[];
}) {
  try {
    const { data, errors } = await getClient().models.LineItem.create(input);

    if (errors) {
      console.error('Errors creating line item:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating line item:', error);
    return { data: null, errors: [error] };
  }
}
