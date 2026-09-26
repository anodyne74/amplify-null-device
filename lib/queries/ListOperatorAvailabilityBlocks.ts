/**
 * List no-driver-availability blocks for a customer
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export async function listOperatorAvailabilityBlocks(customerId: string) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'OperatorAvailabilityBlock', {
      filter: { customerId: { eq: customerId } },
    });

    if (errors.length > 0) {
      console.error('Errors fetching operator availability blocks:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors: undefined };
  } catch (error) {
    console.error('Error listing operator availability blocks:', error);
    return { data: [], errors: [error as Error] };
  }
}
