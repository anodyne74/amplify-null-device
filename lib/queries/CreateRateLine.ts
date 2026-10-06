/**
 * Create a rate card line for a customer
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';

export async function createRateLine(input: {
  customerId: string;
  label: string;
  unit?: 'per_hour' | 'per_stop' | 'per_sign';
  ratePerUnit: number;
  sortOrder?: number;
}) {
  return withDataError('Failed to add rate line.', async () =>
    resultData(await getDataClient().models.RateLine.create(input))
  );
}
