/**
 * List all stops (for admin dashboard aggregation — signs in field, stops serviced)
 */
import { getDataClient } from '@/lib/data-client';

export interface ListAllStopsParams {
  limit?: number;
  nextToken?: string;
}

export async function listAllStops(params?: ListAllStopsParams) {
  try {
    const { data, errors, nextToken } = await getDataClient().models.Stop.list({
      limit: params?.limit || 100,
      nextToken: params?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching stops:', errors);
      return { data: [], errors, nextToken: undefined };
    }

    return { data: data || [], errors: undefined, nextToken };
  } catch (error) {
    console.error('Error listing all stops:', error);
    return { data: [], errors: [error as Error], nextToken: undefined };
  }
}
