/**
 * List all customers (for operator customer dropdown)
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

/** Every Customer, paginated through to the end -- see lib/listAll.ts. */
export async function listAllCustomers() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Customer');

    if (errors.length > 0) {
      console.error('Errors fetching customers:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing all customers:', error);
    return { data: [], errors: [error as Error] };
  }
}
