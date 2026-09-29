/**
 * List rate card lines for a customer, ordered by sortOrder
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';

export async function listRateLines(customerId: string) {
  return withDataError('Failed to load rate lines.', async () => {
    const lines = resultData(await listAll(getDataClient(), 'RateLine', { filter: { customerId: { eq: customerId } } })) ?? [];
    return [...lines].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  });
}
