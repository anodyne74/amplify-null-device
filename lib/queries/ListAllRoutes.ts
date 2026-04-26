/**
 * List all routes (for operators, no customer filter)
 */
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';

function getClient() {
  return generateClient<Schema>();
}

export interface ListAllRoutesParams {
  limit?: number;
  nextToken?: string;
}

export async function listAllRoutes(params?: ListAllRoutesParams) {
  try {
    const { data, errors, nextToken } = await getClient().models.Route.list({
      limit: params?.limit || 50,
      nextToken: params?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors, nextToken: undefined };
    }

    return { data: data || [], errors: undefined, nextToken };
  } catch (error) {
    console.error('Error listing all routes:', error);
    return { data: [], errors: [error as Error], nextToken: undefined };
  }
}
