/**
 * Create a rate card line for a customer
 */
import { getDataClient } from '@/lib/data-client';

export async function createRateLine(input: {
  customerId: string;
  label: string;
  unit?: 'per_hour' | 'per_stop' | 'per_sign';
  ratePerUnit: number;
  sortOrder?: number;
}) {
  try {
    const { data, errors } = await getDataClient().models.RateLine.create(input);

    if (errors) {
      console.error('Errors creating rate line:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating rate line:', error);
    return { data: null, errors: [error as Error] };
  }
}
