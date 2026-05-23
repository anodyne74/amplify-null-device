/**
 * Update a stop by ID
 */
import { getDataClient } from '@/lib/data-client';

export interface UpdateStopInput {
  id: string;
  sequence?: number;
  address?: string;
  serviceType?: string;
  estimatedArrivalTime?: string;
  actualArrivalTime?: string;
  actualDepartureTime?: string;
  numberOfSigns?: number;
  agent?: string;
  isAuction?: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  notes?: string;
}

export async function updateStop(input: UpdateStopInput) {
  try {
    const { data, errors } = await getDataClient().models.Stop.update(input as any);

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
