/**
 * List rate card lines for a customer, ordered by sortOrder
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export async function listRateLines(customerId: string) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'RateLine', {
      filter: { customerId: { eq: customerId } },
    });

    if (errors.length > 0) {
      console.error('Errors fetching rate lines:', errors);
      return { data: [], errors };
    }

    const sorted = [...(data || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return { data: sorted, errors: undefined };
  } catch (error) {
    console.error('Error listing rate lines:', error);
    return { data: [], errors: [error as Error] };
  }
}
