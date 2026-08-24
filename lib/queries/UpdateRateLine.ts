/**
 * Update a rate card line
 */
import { getDataClient } from '@/lib/data-client';

export async function updateRateLine(
  id: string,
  updates: Partial<{
    label: string;
    unit: 'per_hour' | 'per_stop' | 'per_sign';
    ratePerUnit: number;
    sortOrder: number;
  }>
) {
  try {
    const { data, errors } = await getDataClient().models.RateLine.update({ id, ...updates });

    if (errors) {
      console.error('Errors updating rate line:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating rate line:', error);
    return { data: null, errors: [error as Error] };
  }
}
