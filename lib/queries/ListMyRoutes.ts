/**
 * List every route for a customer
 * Used to display route list in customer portal
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export interface ListMyRoutesParams {
  customerId: string;
}

export async function listMyRoutes(params: ListMyRoutesParams) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Route', {
      filter: {
        customerId: {
          eq: params.customerId,
        },
      },
    });

    if (errors.length > 0) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing customer routes:', error);
    return { data: [], errors: [error as Error] };
  }
}
