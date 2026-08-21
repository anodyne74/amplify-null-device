/**
 * List agency-closure blocks for a customer
 */
import { getDataClient } from '@/lib/data-client';

export async function listCustomerClosureBlocks(customerId: string) {
  try {
    const { data, errors } = await getDataClient().models.CustomerClosureBlock.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
    });

    if (errors) {
      console.error('Errors fetching customer closure blocks:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors: undefined };
  } catch (error) {
    console.error('Error listing customer closure blocks:', error);
    return { data: [], errors: [error as Error] };
  }
}
