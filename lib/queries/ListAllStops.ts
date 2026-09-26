/**
 * List all stops (for admin dashboard aggregation — signs in field, stops serviced)
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

/** Every Stop, paginated through to the end -- see lib/listAll.ts. */
export async function listAllStops() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Stop');

    if (errors.length > 0) {
      console.error('Errors fetching stops:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing all stops:', error);
    return { data: [], errors: [error as Error] };
  }
}
