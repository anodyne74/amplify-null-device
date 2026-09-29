/**
 * Create an operator payout record (a pending driver-split payout owed for a period)
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';

export async function createOperatorPayout(input: {
  operatorSub: string;
  customerId: string;
  routeId?: string;
  periodStartDate?: string;
  periodEndDate?: string;
  amount: number;
  status?: 'pending' | 'paid';
  notes?: string;
}) {
  return withDataError('Failed to create payout.', async () =>
    resultData(await getDataClient().models.OperatorPayout.create({ status: 'pending', ...input }))
  );
}
