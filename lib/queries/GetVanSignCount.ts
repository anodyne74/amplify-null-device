/**
 * Get an operator's van sign count for a given date (one record per operator per day)
 */
import { getDataClient } from '@/lib/data-client';

export async function getVanSignCount(operatorSub: string, countDate: string) {
  try {
    const { data, errors } = await getDataClient().models.VanSignCount.list({
      filter: { operatorSub: { eq: operatorSub }, countDate: { eq: countDate } },
      limit: 1,
    });

    if (errors) {
      console.error('Errors fetching van sign count:', errors);
      return { data: null, errors };
    }

    return { data: data?.[0] ?? null, errors: undefined };
  } catch (error) {
    console.error('Error fetching van sign count:', error);
    return { data: null, errors: [error as Error] };
  }
}
