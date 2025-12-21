/**
 * List customer's routes with pagination
 * Used to display route list in customer portal
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

const client = generateClient<Schema>();

export interface ListMyRoutesParams {
  limit?: number;
  nextToken?: string;
  customerId: string;
}

export async function listMyRoutes(params: ListMyRoutesParams) {
  try {
    const { data, errors, nextToken } = await client.models.Route.list({
      filter: {
        customerId: {
          eq: params.customerId,
        },
      },
      limit: params.limit || 20,
      nextToken: params.nextToken,
    });

    if (errors) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors, nextToken: undefined };
    }

    return { data: data || [], errors: undefined, nextToken };
  } catch (error) {
    console.error('Error listing customer routes:', error);
    return { data: [], errors: [error as Error], nextToken: undefined };
  }
}
