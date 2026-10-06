/**
 * Create a no-driver-availability block (staff-only — blocks a date for a customer)
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';

export async function createOperatorAvailabilityBlock(input: {
  customerId: string;
  date: string;
  reason?: string;
  createdByOperatorId?: string;
  viewerSubs?: string[];
}) {
  return withDataError('Failed to update the service calendar.', async () =>
    resultData(await getDataClient().models.OperatorAvailabilityBlock.create(input))
  );
}
