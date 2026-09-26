/**
 * List all routes (for operators, no customer filter)
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

/** Every Route, paginated through to the end -- see lib/listAll.ts. */
export async function listAllRoutes() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Route');

    if (errors.length > 0) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing all routes:', error);
    return { data: [], errors: [error as Error] };
  }
}
