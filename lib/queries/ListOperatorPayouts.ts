/**
 * List operator payouts (admin — cross-customer, cross-operator)
 */
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

export async function listOperatorPayouts() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'OperatorPayout');

    if (errors.length > 0) {
      console.error('Errors fetching operator payouts:', errors);
      return { data: [], errors };
    }

    const sorted = [...data].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { data: sorted, errors: undefined };
  } catch (error) {
    console.error('Error listing operator payouts:', error);
    return { data: [], errors: [error as Error] };
  }
}
