/**
 * List no-driver-availability blocks for a customer
 */
import { getDataClient } from '@/lib/data-client';

export async function listOperatorAvailabilityBlocks(customerId: string) {
  try {
    const { data, errors } = await getDataClient().models.OperatorAvailabilityBlock.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
    });

    if (errors) {
      console.error('Errors fetching operator availability blocks:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors: undefined };
  } catch (error) {
    console.error('Error listing operator availability blocks:', error);
    return { data: [], errors: [error as Error] };
  }
}
