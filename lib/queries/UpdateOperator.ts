/**
 * Update an Operator directory (Driver roster) record.
 */
import { getDataClient } from '@/lib/data-client';
import type { BillingCycle, OperatorStatus } from '@/amplify/types';

export async function updateOperator(
  id: string,
  updates: Partial<{
    phone: string;
    vehicleAndRego: string;
    homeBase: string;
    status: OperatorStatus;
    driverSplitPercent: number;
    payCycle: BillingCycle;
    paySplitOnCompletedStopsOnly: boolean;
    assignedCustomerIds: string[];
  }>
) {
  try {
    const { data, errors } = await getDataClient().models.Operator.update({ id, ...updates });

    if (errors) {
      console.error('Errors updating operator:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating operator:', error);
    return { data: null, errors: [error as Error] };
  }
}
