/**
 * Get invoice detail with line items
 * Used to display invoice detail page with itemized charges
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { Invoice, LineItem } from '@/amplify/types';
import { getCustomerPortalContext } from '@/lib/queries';

let _client: ReturnType<typeof generateClient<Schema>> | null = null;
function getClient() {
  if (!_client) _client = generateClient<Schema>();
  return _client;
}

export interface GetInvoiceDetailParams {
  invoiceId: string;
  customerId: string; // For authorization verification
  userSub?: string;
}

export interface InvoiceDetail {
  id: string;
  customerId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  periodStartDate?: string;
  periodEndDate?: string;
  totalAmount?: number;
  status?: string;
  lineItems?: Array<{
    id?: string;
    invoiceId?: string;
    description?: string;
    quantity?: number;
    ratePerUnit?: number;
    amount?: number;
  }>;
}

export async function getInvoiceDetail(params: GetInvoiceDetailParams) {
  try {
    if (params.userSub) {
      const portalContext = await getCustomerPortalContext(params.userSub);
      if (portalContext.role === 'read_only') {
        return { data: null, errors: ['Access denied'] };
      }
    }

    // Fetch the invoice
    const invoiceResponse = await getClient().models.Invoice.get({
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

    // Fetch line items for this invoice
    const { data: lineItems, errors: lineItemsErrors } = await getClient().models.LineItem.list({
      filter: {
        invoiceId: {
          eq: params.invoiceId,
        },
        customerId: {
          eq: params.customerId,
        },
      },
    });

    if (lineItemsErrors) {
      console.error('Errors fetching line items:', lineItemsErrors);
      return { data: null, errors: lineItemsErrors };
    }

    // Transform to plain JavaScript object
    const detail: InvoiceDetail = {
      id: invoice.id || '',
      customerId: invoice.customerId || '',
      invoiceNumber: invoice.invoiceNumber || undefined,
      invoiceDate: invoice.invoiceDate || undefined,
      periodStartDate: invoice.periodStartDate || undefined,
      periodEndDate: invoice.periodEndDate || undefined,
      totalAmount: invoice.totalAmount || undefined,
      status: invoice.status || undefined,
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
