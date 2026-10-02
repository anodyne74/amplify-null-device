/**
 * List the Operator directory (Driver roster — see amplify/data/resource.ts's
 * Operator model comment: Driver and Operator are the same record). Returns
 * them or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';

export async function listOperators() {
  return withDataError('Failed to load operators.', async () => {
    const operators = resultData(await listAll(getDataClient(), 'Operator')) ?? [];
    return [...operators].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  });
}
