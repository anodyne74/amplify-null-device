/**
 * The Invoice aggregate -- an Invoice and its LineItems -- as the browser reads
 * and writes it through the signed-in user's data client. Admin screens use the
 * list/get/create/update/delete functions; the customer portal reads through
 * getInvoiceDetail and listMyInvoices, which also refuse read_only users.
 */
import { getCustomerPortalContext } from '@/lib/customers';
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

/**
 * Fetch invoices for a single customer (admin customers panel — onboarding checklist).
 */
export async function listCustomerInvoices(customerId: string) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Invoice', {
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
    const { data, errors } = await listAll(getDataClient(), 'Invoice');

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
    const { data: invoice, errors: invoiceErrors } = await getDataClient().models.Invoice.get({
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
    const { data: lineItems, errors: lineItemsErrors } = await listAll(getDataClient(), 'LineItem', {
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
    const { data, errors } = await getDataClient().models.Invoice.create(input);

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
    const { data, errors } = await getDataClient().models.Invoice.update({
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
    const client = getDataClient();
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
    const { data, errors } = await getDataClient().models.LineItem.create(input);

    if (errors) {
      console.error('Errors creating line item:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating line item:', error);
    return { data: null, errors: [error] };
  }
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
 * Used to display invoice detail page with itemized charges
 */
export async function getInvoiceDetail(params: GetInvoiceDetailParams) {
  try {
    if (params.userSub) {
      const portalContext = await getCustomerPortalContext(params.userSub);
      if (portalContext.role === 'read_only') {
        return { data: null, errors: ['Access denied'] };
      }
    }

    // Fetch the invoice
    const invoiceResponse = await getDataClient().models.Invoice.get({
      id: params.invoiceId,
    });

    if (!invoiceResponse || !invoiceResponse.data) {
      return { data: null, errors: ['Invoice not found'] };
    }

    const invoice = invoiceResponse.data;

    // Verify customer owns this invoice
    if (invoice.customerId !== params.customerId) {
      return { data: null, errors: ['Access denied'] };
    }

    // Fetch customer name for display and PDF file naming
    const { data: customer } = await getDataClient().models.Customer.get({
      id: invoice.customerId,
    });

    // Fetch line items for this invoice
    const { data: lineItems, errors: lineItemsErrors } = await listAll(getDataClient(), 'LineItem', {
      filter: {
        invoiceId: {
          eq: params.invoiceId,
        },
        customerId: {
          eq: params.customerId,
        },
      },
    });

    if (lineItemsErrors.length > 0) {
      console.error('Errors fetching line items:', lineItemsErrors);
      return { data: null, errors: lineItemsErrors };
    }

    // Transform to plain JavaScript object
    const detail: InvoiceDetail = {
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
      pdfS3Key: invoice.pdfS3Key || undefined,
      lineItems: (lineItems || []).map((item: any) => ({
        id: item.id,
        invoiceId: item.invoiceId,
        description: item.description,
        quantity: item.quantity,
        ratePerUnit: item.ratePerUnit,
        amount: item.amount,
      })),
    };

    return { data: detail, errors: undefined };
  } catch (error) {
    console.error('Error fetching invoice detail:', error);
    return { data: null, errors: [error as Error] };
  }
}

export interface ListMyInvoicesParams {
  customerId: string;
  userSub?: string;
  startDate?: string; // ISO 8601 format (YYYY-MM-DD)
  endDate?: string;   // ISO 8601 format (YYYY-MM-DD)
}

/**
 * List customer's invoices with optional date filtering
 * Used to display invoice list in customer portal
 */
export async function listMyInvoices(params: ListMyInvoicesParams) {
  try {
    if (params.userSub) {
      const portalContext = await getCustomerPortalContext(params.userSub);
      if (portalContext.role === 'read_only') {
        return {
          data: [],
          errors: [new Error('Access denied: reviewer users cannot view invoices.')],
        };
      }
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

    const { data, errors } = await listAll(getDataClient(), 'Invoice', {
      filter,
    });

    if (errors.length > 0) {
      console.error('Errors fetching invoices:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing customer invoices:', error);
    return { data: [], errors: [error as Error] };
  }
}
