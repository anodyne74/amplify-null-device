/**
 * Update an existing van sign count record
 */
import { getDataClient } from '@/lib/data-client';

export async function updateVanSignCount(
  id: string,
  updates: Partial<{
    standardCount: number;
    auctionCount: number;
    frameCount: number;
    countedAt: string;
  }>
) {
  try {
    const { data, errors } = await getDataClient().models.VanSignCount.update({ id, ...updates });

    if (errors) {
      console.error('Errors updating van sign count:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating van sign count:', error);
    return { data: null, errors: [error as Error] };
  }
}
