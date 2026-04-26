/**
 * List all customers (for operator customer dropdown)
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

function getClient() {
  return generateClient<Schema>();
}

export interface ListAllCustomersParams {
  limit?: number;
  nextToken?: string;
}

export async function listAllCustomers(params?: ListAllCustomersParams) {
  try {
    const { data, errors, nextToken } = await getClient().models.Customer.list({
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
