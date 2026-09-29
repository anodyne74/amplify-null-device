/**
 * Delete a rate card line by ID
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';

export async function deleteRateLine(id: string): Promise<void> {
  return withDataError('Failed to remove rate line.', async () => {
    resultData(await getDataClient().models.RateLine.delete({ id }));
  });
}
