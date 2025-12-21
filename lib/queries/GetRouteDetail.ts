/**
 * Get single route with all stops
 * Used for route detail view
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

const client = generateClient<Schema>();

export async function getRouteDetail(routeId: string) {
  try {
    const { data, errors } = await client.models.Route.get({
      id: routeId,
    });

    if (errors) {
      console.error('Errors fetching route:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error getting route detail:', error);
    return { data: null, errors: [error as Error] };
  }
}
