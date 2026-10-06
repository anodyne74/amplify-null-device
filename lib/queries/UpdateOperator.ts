/**
 * Update an Operator directory (Driver roster) record.
 *
 * Returns its data or throws a DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import type { BillingCycle, OperatorStatus } from '@/amplify/types';

export async function updateOperator(
  id: string,
  updates: Partial<{
    /** International form (lib/operatorMobile.ts); null clears it. */
    phone: string | null;
    vehicleAndRego: string;
    homeBase: string;
    status: OperatorStatus;
    driverSplitPercent: number;
    payCycle: BillingCycle;
    paySplitOnCompletedStopsOnly: boolean;
    assignedCustomerIds: string[];
  }>
) {
  return withDataError('Failed to update operator.', async () =>
    resultData(await getDataClient().models.Operator.update({ id, ...updates }))
  );
}
