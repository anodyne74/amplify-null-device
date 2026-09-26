/**
 * List the Operator directory (Driver roster — see amplify/data/resource.ts's
 * Operator model comment: Driver and Operator are the same record).
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export async function listOperators() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Operator');

    if (errors.length > 0) {
      console.error('Errors fetching operators:', errors);
      return { data: [], errors };
    }

    const sorted = [...data].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return { data: sorted, errors: undefined };
  } catch (error) {
    console.error('Error listing operators:', error);
    return { data: [], errors: [error as Error] };
  }
}
