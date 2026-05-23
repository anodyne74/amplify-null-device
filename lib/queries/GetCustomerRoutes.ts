import { getDataClient } from '@/lib/data-client';

/**
 * Get all routes for a customer
 * Used for customer routes list view
 */
export async function getCustomerRoutes(customerId: string) {
  try {
    const { data, errors } = await getDataClient().models.Route.list({
      filter: {
        customerId: {
          eq: customerId,
        },
      },
      selectionSet: ['id', 'status', 'createdAt', 'estimatedDurationMinutes', 'routes'],
    });

    if (errors) {
      console.error('Errors fetching customer routes:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors: undefined };
  } catch (error) {
    console.error('Error getting customer routes:', error);
    return { data: [], errors: [error as Error] };
  }
}
