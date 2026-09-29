/**
 * List operator payouts (admin — cross-customer, cross-operator)
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';

export async function listOperatorPayouts() {
  return withDataError('Failed to load payouts.', async () => {
    const payouts = resultData(await listAll(getDataClient(), 'OperatorPayout')) ?? [];
    return [...payouts].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  });
}
