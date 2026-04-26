/**
 * Delete a stop by ID
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

function getClient() {
  return generateClient<Schema>();
}

export async function deleteStop(stopId: string) {
  try {
    const { data, errors } = await getClient().models.Stop.delete({ id: stopId });

    if (errors) {
      console.error('Errors deleting stop:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error deleting stop:', error);
    return { data: null, errors: [error as Error] };
  }
}
