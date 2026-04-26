/**
 * Update a stop by ID
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

function getClient() {
  return generateClient<Schema>();
}

export interface UpdateStopInput {
  id: string;
  sequence?: number;
  address?: string;
  serviceType?: string;
  estimatedArrivalTime?: string;
  notes?: string;
}

export async function updateStop(input: UpdateStopInput) {
  try {
    const { data, errors } = await getClient().models.Stop.update(input as any);

    if (errors) {
      console.error('Errors updating stop:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error updating stop:', error);
    return { data: null, errors: [error as Error] };
  }
}
