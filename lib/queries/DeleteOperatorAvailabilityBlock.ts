/**
 * Delete a no-driver-availability block by ID
 */
import { getDataClient } from '@/lib/data-client';

export async function deleteOperatorAvailabilityBlock(id: string) {
  try {
    const { data, errors } = await getDataClient().models.OperatorAvailabilityBlock.delete({ id });

    if (errors) {
      console.error('Errors deleting operator availability block:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error deleting operator availability block:', error);
    return { data: null, errors: [error as Error] };
  }
}
