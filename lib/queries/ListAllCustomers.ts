/**
 * List all customers (for operator customer dropdown)
 */
import { getDataClient } from '@/lib/data-client';

export interface ListAllCustomersParams {
  limit?: number;
  nextToken?: string;
}

export async function listAllCustomers(params?: ListAllCustomersParams) {
  try {
    const { data, errors, nextToken } = await getDataClient().models.Customer.list({
      limit: params?.limit || 100,
      nextToken: params?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching customers:', errors);
      return { data: [], errors, nextToken: undefined };
    }

    return { data: data || [], errors: undefined, nextToken };
  } catch (error) {
    console.error('Error listing all customers:', error);
    return { data: [], errors: [error as Error], nextToken: undefined };
  }
}
