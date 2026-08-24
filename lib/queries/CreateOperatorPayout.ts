/**
 * Create an operator payout record (a pending driver-split payout owed for a period)
 */
import { getDataClient } from '@/lib/data-client';

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
  try {
    const { data, errors } = await getDataClient().models.OperatorPayout.create({
      status: 'pending',
      ...input,
    });

    if (errors) {
      console.error('Errors creating operator payout:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating operator payout:', error);
    return { data: null, errors: [error as Error] };
  }
}
