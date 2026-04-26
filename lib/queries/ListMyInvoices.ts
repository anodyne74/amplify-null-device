/**
 * List customer's invoices with optional date filtering
 * Used to display invoice list in customer portal
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

function getClient() {
  return generateClient<Schema>();
}

export interface ListMyInvoicesParams {
  limit?: number;
  nextToken?: string;
  customerId: string;
  startDate?: string; // ISO 8601 format (YYYY-MM-DD)
  endDate?: string;   // ISO 8601 format (YYYY-MM-DD)
}

export async function listMyInvoices(params: ListMyInvoicesParams) {
  try {
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

    const { data, errors, nextToken } = await getClient().models.Invoice.list({
      filter,
      limit: params.limit || 20,
      nextToken: params.nextToken,
    });

    if (errors) {
      console.error('Errors fetching invoices:', errors);
      return { data: [], errors, nextToken: undefined };
    }

    return { data: data || [], errors: undefined, nextToken };
  } catch (error) {
    console.error('Error listing customer invoices:', error);
    return { data: [], errors: [error as Error], nextToken: undefined };
  }
}
