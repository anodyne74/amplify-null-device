/**
 * Create an agency-closure block (customer account_owner — blocks a date on their own calendar)
 */
import { getDataClient } from '@/lib/data-client';

export async function createCustomerClosureBlock(input: {
  customerId: string;
  date: string;
  reason?: string;
  createdByUserSub?: string;
  accountOwnerSub?: string;
  viewerSubs?: string[];
}) {
  try {
    const { data, errors } = await getDataClient().models.CustomerClosureBlock.create(input);

    if (errors) {
      console.error('Errors creating customer closure block:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating customer closure block:', error);
    return { data: null, errors: [error as Error] };
  }
}
