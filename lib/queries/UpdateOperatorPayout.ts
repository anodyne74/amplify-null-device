/**
 * Update an operator payout — used to mark a payout as paid
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';

export async function updateOperatorPayout(
  id: string,
  updates: Partial<{
    status: 'pending' | 'paid';
    paidAt: string;
    notes: string;
  }>
) {
  return withDataError('Failed to update payout.', async () =>
    resultData(await getDataClient().models.OperatorPayout.update({ id, ...updates }))
  );
}
