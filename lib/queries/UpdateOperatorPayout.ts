/**
 * Update an operator payout — used to mark a payout as paid
 */
import { getDataClient } from '@/lib/data-client';

export async function updateOperatorPayout(
  id: string,
  updates: Partial<{
    status: 'pending' | 'paid';
    paidAt: string;
    notes: string;
  }>
) {
  try {
    const { data, errors } = await getDataClient().models.OperatorPayout.update({ id, ...updates });

    if (errors) {
      console.error('Errors updating operator payout:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating operator payout:', error);
    return { data: null, errors: [error as Error] };
  }
}
