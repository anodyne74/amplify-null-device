/**
 * Delete a stop by ID
 */
import { getDataClient } from '@/lib/data-client';

export async function deleteStop(stopId: string) {
  try {
    const { data, errors } = await getDataClient().models.Stop.delete({ id: stopId });

    if (errors) {
      console.error('Errors deleting stop:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error deleting stop:', error);
    return { data: null, errors: [error as Error] };
  }
}
