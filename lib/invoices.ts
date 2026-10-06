/**
 * The Invoice aggregate -- an Invoice and its LineItems -- as the browser reads
 * and writes it through the signed-in user's data client. Admin screens use the
 * list/get/create/update/delete functions; the customer portal reads through
 * getInvoiceDetail and listMyInvoices, which also refuse read_only users.
 *
 * Every function returns its data or throws a DataError whose message can be
 * shown as it is (lib/graphqlResult.ts); a missing Invoice is null, not an error.
 */
import { callApi } from '@/lib/apiClient';
import { getCustomerPortalContext } from '@/lib/customers';
import { getDataClient } from '@/lib/data-client';
import { DataError, resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';
import { getRouteCode, listCustomerRouteCodes } from '@/lib/routes';

/**
 * Fetch invoices for a single customer (admin customers panel — onboarding checklist).
 */
export async function listCustomerInvoices(customerId: string) {
  return withDataError('Failed to load invoices.', async () =>
    resultData(await listAll(getDataClient(), 'Invoice', { filter: { customerId: { eq: customerId } } })) ?? []
  );
}

/**
 * Fetch the invoices raised for one Route (admin Route detail — already-invoiced warning).
 */
export async function listRouteInvoices(routeId: string) {
  return withDataError('Failed to load invoices.', async () =>
    resultData(await listAll(getDataClient(), 'Invoice', { filter: { routeId: { eq: routeId } } })) ?? []
  );
}

/**
 * Fetch all invoices for administrators/operators.
 */
export async function listInvoices(options?: { status?: 'draft' | 'sent' | 'paid' }) {
  return withDataError('Failed to load invoices.', async () => {
    const invoices = resultData(await listAll(getDataClient(), 'Invoice')) ?? [];
    return options?.status ? invoices.filter((invoice) => invoice.status === options.status) : invoices;
  });
}

/**
 * Fetch a specific invoice with its line items, or null when there's no such invoice.
 */
export async function getInvoiceWithLineItems(invoiceId: string) {
  return withDataError('Failed to load invoice.', async () => {
    const invoice = resultData(await getDataClient().models.Invoice.get({ id: invoiceId }));
    if (!invoice) return null;

    const lineItems =
      resultData(await listAll(getDataClient(), 'LineItem', { filter: { invoiceId: { eq: invoiceId } } })) ?? [];
    return { invoice, lineItems };
  });
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
  return withDataError('Failed to create invoice.', async () =>
    resultData(await getDataClient().models.Invoice.create(input))
  );
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
  return withDataError('Failed to update invoice.', async () =>
    resultData(await getDataClient().models.Invoice.update({ id: invoiceId, ...updates }))
  );
}

/**
 * Deletes an invoice and its LineItems. Callers are expected to only allow
 * this for invoices that haven't been sent (draft, no emailSentAt) — a sent
 * or paid invoice is a record that shouldn't disappear from history.
 */
export async function deleteInvoice(invoiceId: string) {
  return withDataError('Failed to delete invoice.', async () => {
    const client = getDataClient();
    const lineItems = resultData(await listAll(client, 'LineItem', { filter: { invoiceId: { eq: invoiceId } } })) ?? [];

    const lineItemDeletes = await Promise.all(
      lineItems.map((lineItem) => client.models.LineItem.delete({ id: lineItem.id }))
    );
    resultData({ errors: lineItemDeletes.flatMap((result) => result.errors ?? []) });

    return resultData(await client.models.Invoice.delete({ id: invoiceId }));
  });
}

/**
 * A short-lived link to an invoice's PDF, through /api/invoices/pdf (#356):
 * customer users have no storage access of their own to invoice PDFs.
 */
export async function openInvoicePdf(invoiceId: string): Promise<string> {
  return (await callApi<{ url: string }>('/api/invoices/pdf', { invoiceId })).url;
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
  return withDataError('Failed to create line item.', async () =>
    resultData(await getDataClient().models.LineItem.create(input))
  );
}

export interface GetInvoiceDetailParams {
  invoiceId: string;
  customerId: string; // For authorization verification
  userSub?: string;
}

export interface InvoiceDetail {
  id: string;
  customerId: string;
  customerName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  periodStartDate?: string;
  periodEndDate?: string;
  totalAmount?: number;
  status?: string;
  routeId?: string;
  routeCode?: string;
  pdfS3Key?: string;
  lineItems?: Array<{
    id?: string;
    invoiceId?: string;
    description?: string;
    quantity?: number;
    ratePerUnit?: number;
    amount?: number;
  }>;
}

/**
 * Get invoice detail with line items
 * Used to display invoice detail page with itemized charges. Null when the
 * invoice doesn't exist, belongs to another Customer, or the user is
 * read_only -- the page says "not found" for all three, so it never reveals
 * that someone else's invoice exists.
 */
export async function getInvoiceDetail(params: GetInvoiceDetailParams): Promise<InvoiceDetail | null> {
  return withDataError('Failed to load invoice.', async () => {
    if (params.userSub) {
      const portalContext = await getCustomerPortalContext(params.userSub);
      if (portalContext?.role === 'read_only') return null;
    }

    const invoice = resultData(await getDataClient().models.Invoice.get({ id: params.invoiceId }));
    if (!invoice || invoice.customerId !== params.customerId) return null;

    // Customer name for display and PDF file naming; best-effort.
    const { data: customer } = await getDataClient().models.Customer.get({
      id: invoice.customerId,
    });

    const lineItems =
      resultData(
        await listAll(getDataClient(), 'LineItem', {
          filter: {
            invoiceId: { eq: params.invoiceId },
            customerId: { eq: params.customerId },
          },
        })
      ) ?? [];

    const routeCode = invoice.routeId ? await getRouteCode(invoice.routeId) : undefined;

    return {
      id: invoice.id || '',
      customerId: invoice.customerId || '',
      customerName: customer?.name || undefined,
      invoiceNumber: invoice.invoiceNumber || undefined,
      invoiceDate: invoice.invoiceDate || undefined,
      periodStartDate: invoice.periodStartDate || undefined,
      periodEndDate: invoice.periodEndDate || undefined,
      totalAmount: invoice.totalAmount || undefined,
      status: invoice.status || undefined,
      routeId: invoice.routeId || undefined,
      routeCode,
      pdfS3Key: invoice.pdfS3Key || undefined,
      lineItems: lineItems.map((item) => ({
        id: item.id,
        invoiceId: item.invoiceId,
        description: item.description,
        quantity: item.quantity ?? undefined,
        ratePerUnit: item.ratePerUnit,
        amount: item.amount,
      })),
    };
  });
}

export interface ListMyInvoicesParams {
  customerId: string;
  userSub?: string;
  startDate?: string; // ISO 8601 format (YYYY-MM-DD)
  endDate?: string;   // ISO 8601 format (YYYY-MM-DD)
}

/**
 * List customer's invoices with optional date filtering
 * Used to display invoice list in customer portal. A read_only user gets
 * DataError('Access denied').
 */
export async function listMyInvoices(params: ListMyInvoicesParams) {
  return withDataError('Failed to load invoices.', async () => {
    if (params.userSub) {
      const portalContext = await getCustomerPortalContext(params.userSub);
      if (portalContext?.role === 'read_only') throw new DataError('Access denied');
    }

    // Build filter with customerId and optional date range
    const filter: any = {
      customerId: {
        eq: params.customerId,
      },
    };

    // Add date range filter if provided
    if (params.startDate || params.endDate) {
      filter.invoiceDate = {};
      if (params.startDate) {
        filter.invoiceDate.ge = params.startDate;
      }
      if (params.endDate) {
        filter.invoiceDate.le = params.endDate;
      }
    }

    const invoices = resultData(await listAll(getDataClient(), 'Invoice', { filter })) ?? [];

    const routeCodes = invoices.some((invoice) => invoice.routeId)
      ? await listCustomerRouteCodes(params.customerId)
      : new Map<string, string>();

    return invoices.map((invoice) => ({
      ...invoice,
      routeCode: (invoice.routeId && routeCodes.get(invoice.routeId)) || null,
    }));
  });
}
