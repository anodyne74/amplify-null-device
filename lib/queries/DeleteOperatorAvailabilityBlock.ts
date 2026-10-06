/**
 * Delete a no-driver-availability block by ID
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';

export async function deleteOperatorAvailabilityBlock(id: string): Promise<void> {
  return withDataError('Failed to update the service calendar.', async () => {
    resultData(await getDataClient().models.OperatorAvailabilityBlock.delete({ id }));
  });
}
