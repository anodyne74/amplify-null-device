/**
 * List rate card lines for a customer, ordered by sortOrder
 */
import { getDataClient } from '@/lib/data-client';

export async function listRateLines(customerId: string) {
  try {
    const { data, errors } = await getDataClient().models.RateLine.list({
      filter: { customerId: { eq: customerId } },
      limit: 200,
    });

    if (errors) {
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
