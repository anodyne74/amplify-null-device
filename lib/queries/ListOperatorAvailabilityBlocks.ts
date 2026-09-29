/**
 * List no-driver-availability blocks for a customer
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';

export async function listOperatorAvailabilityBlocks(customerId: string) {
  return withDataError('Failed to load the service calendar.', async () =>
    resultData(
      await listAll(getDataClient(), 'OperatorAvailabilityBlock', { filter: { customerId: { eq: customerId } } })
    ) ?? []
  );
}
