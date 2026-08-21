/**
 * Delete an agency-closure block by ID
 */
import { getDataClient } from '@/lib/data-client';

export async function deleteCustomerClosureBlock(id: string) {
  try {
    const { data, errors } = await getDataClient().models.CustomerClosureBlock.delete({ id });

    if (errors) {
      console.error('Errors deleting customer closure block:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error deleting customer closure block:', error);
    return { data: null, errors: [error as Error] };
  }
}
