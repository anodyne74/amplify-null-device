/**
 * Delete a rate card line by ID
 */
import { getDataClient } from '@/lib/data-client';

export async function deleteRateLine(id: string) {
  try {
    const { data, errors } = await getDataClient().models.RateLine.delete({ id });

    if (errors) {
      console.error('Errors deleting rate line:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error deleting rate line:', error);
    return { data: null, errors: [error as Error] };
  }
}
