/**
 * List the Operator directory (Driver roster — see amplify/data/resource.ts's
 * Operator model comment: Driver and Operator are the same record).
 */
import { getDataClient } from '@/lib/data-client';

export interface ListOperatorsParams {
  limit?: number;
  nextToken?: string;
}

export async function listOperators(params?: ListOperatorsParams) {
  try {
    const { data, errors, nextToken } = await getDataClient().models.Operator.list({
      limit: params?.limit || 200,
      nextToken: params?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching operators:', errors);
      return { data: [], errors, nextToken: undefined };
    }

    const sorted = [...(data || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return { data: sorted, errors: undefined, nextToken };
  } catch (error) {
    console.error('Error listing operators:', error);
    return { data: [], errors: [error as Error], nextToken: undefined };
  }
}
