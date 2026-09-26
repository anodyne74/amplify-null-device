/**
 * List agency-closure blocks for a customer
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export async function listCustomerClosureBlocks(customerId: string) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'CustomerClosureBlock', {
      filter: { customerId: { eq: customerId } },
    });

    if (errors.length > 0) {
      console.error('Errors fetching customer closure blocks:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors: undefined };
  } catch (error) {
    console.error('Error listing customer closure blocks:', error);
    return { data: [], errors: [error as Error] };
  }
}
