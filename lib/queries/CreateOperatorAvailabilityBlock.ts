/**
 * Create a no-driver-availability block (staff-only — blocks a date for a customer)
 */
import { getDataClient } from '@/lib/data-client';

export async function createOperatorAvailabilityBlock(input: {
  customerId: string;
  date: string;
  reason?: string;
  createdByOperatorId?: string;
  viewerSubs?: string[];
}) {
  try {
    const { data, errors } = await getDataClient().models.OperatorAvailabilityBlock.create(input);

    if (errors) {
      console.error('Errors creating operator availability block:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating operator availability block:', error);
    return { data: null, errors: [error as Error] };
  }
}
