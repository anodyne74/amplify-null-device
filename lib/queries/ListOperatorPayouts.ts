/**
 * List operator payouts (admin — cross-customer, cross-operator)
 */
import { getDataClient } from '@/lib/data-client';

export interface ListOperatorPayoutsParams {
  limit?: number;
  nextToken?: string;
}

export async function listOperatorPayouts(params?: ListOperatorPayoutsParams) {
  try {
    const { data, errors, nextToken } = await getDataClient().models.OperatorPayout.list({
      limit: params?.limit || 200,
      nextToken: params?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching operator payouts:', errors);
      return { data: [], errors, nextToken: undefined };
    }

    const sorted = [...(data || [])].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { data: sorted, errors: undefined, nextToken };
  } catch (error) {
    console.error('Error listing operator payouts:', error);
    return { data: [], errors: [error as Error], nextToken: undefined };
  }
}
