/**
 * Create today's van sign count for an operator
 */
import { getDataClient } from '@/lib/data-client';

export async function createVanSignCount(input: {
  operatorSub: string;
  countDate: string;
  standardCount: number;
  auctionCount: number;
  frameCount: number;
  countedAt: string;
}) {
  try {
    const { data, errors } = await getDataClient().models.VanSignCount.create(input);

    if (errors) {
      console.error('Errors creating van sign count:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating van sign count:', error);
    return { data: null, errors: [error as Error] };
  }
}
