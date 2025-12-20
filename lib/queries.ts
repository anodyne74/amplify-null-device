/**
 * GraphQL-like query helpers for Amplify Data
 * These utilities encapsulate the data fetching patterns and enable type-safe operations
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';

const client = generateClient<Schema>();

/**
 * Fetch all customers
 * Used by operators to view all customers in the system
 */
export async function listCustomers(options?: { limit?: number; nextToken?: string }) {
  try {
    const { data, errors } = await client.models.Customer.list({
      limit: options?.limit || 20,
      nextToken: options?.nextToken,
    });
    if (errors) {
      console.error('Errors fetching customers:', errors);
      return { data: [], errors };
    }
    return { data: data || [], errors };
  } catch (error) {
    console.error('Error listing customers:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Fetch a specific customer by ID
 */
export async function getCustomer(customerId: string) {
  try {
    const { data, errors } = await client.models.Customer.get({ id: customerId });
    if (errors) {
      console.error('Errors fetching customer:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error getting customer:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Fetch all routes for a specific customer
 */
export async function listCustomerRoutes(
  customerId: string,
  options?: { limit?: number; nextToken?: string; status?: string }
) {
  try {
    let routes = [];
    let nextToken: string | undefined = options?.nextToken;

    // Fetch routes with pagination
    const { data, errors } = await client.models.Route.list({
      filter: { customerId: { eq: customerId } },
      limit: options?.limit || 20,
      nextToken,
    });

    if (errors) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors };
    }

    routes = data || [];

    // Apply status filter if provided (client-side filtering as Amplify doesn't support complex filters)
    if (options?.status) {
      routes = routes.filter((route) => route.status === options.status);
    }

    return { data: routes, errors };
  } catch (error) {
    console.error('Error listing customer routes:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Fetch a specific route with all its stops
 */
export async function getRouteWithStops(routeId: string) {
  try {
    const { data: route, errors: routeErrors } = await client.models.Route.get({ id: routeId });

    if (routeErrors) {
      console.error('Errors fetching route:', routeErrors);
      return { route: null, stops: [], errors: routeErrors };
    }

    if (!route) {
      return { route: null, stops: [], errors: [] };
    }

    // Fetch stops for this route
    const { data: stops, errors: stopsErrors } = await client.models.Stop.list({
      filter: { routeId: { eq: routeId } },
    });

    if (stopsErrors) {
      console.error('Errors fetching stops:', stopsErrors);
    }

    return { route, stops: stops || [], errors: stopsErrors || [] };
  } catch (error) {
    console.error('Error getting route with stops:', error);
    return { route: null, stops: [], errors: [error] };
  }
}

/**
 * Fetch all invoices for a specific customer
 */
export async function listCustomerInvoices(
  customerId: string,
  options?: { limit?: number; nextToken?: string }
) {
  try {
    const { data, errors } = await client.models.Invoice.list({
      filter: { customerId: { eq: customerId } },
      limit: options?.limit || 20,
      nextToken: options?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching invoices:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors };
  } catch (error) {
    console.error('Error listing customer invoices:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Fetch a specific invoice with its line items
 */
export async function getInvoiceWithLineItems(invoiceId: string) {
  try {
    const { data: invoice, errors: invoiceErrors } = await client.models.Invoice.get({
      id: invoiceId,
    });

    if (invoiceErrors) {
      console.error('Errors fetching invoice:', invoiceErrors);
      return { invoice: null, lineItems: [], errors: invoiceErrors };
    }

    if (!invoice) {
      return { invoice: null, lineItems: [], errors: [] };
    }

    // Fetch line items for this invoice
    const { data: lineItems, errors: lineItemsErrors } = await client.models.LineItem.list({
      filter: { invoiceId: { eq: invoiceId } },
    });

    if (lineItemsErrors) {
      console.error('Errors fetching line items:', lineItemsErrors);
    }

    return { invoice, lineItems: lineItems || [], errors: lineItemsErrors || [] };
  } catch (error) {
    console.error('Error getting invoice with line items:', error);
    return { invoice: null, lineItems: [], errors: [error] };
  }
}

/**
 * Create a new route for a customer
 */
export async function createRoute(input: {
  customerId: string;
  status: 'planned' | 'active' | 'completed' | 'archived';
  estimatedDurationMinutes?: number;
  notes?: string;
}) {
  try {
    const { data, errors } = await client.models.Route.create(input);

    if (errors) {
      console.error('Errors creating route:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating route:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Update an existing route
 */
export async function updateRoute(
  routeId: string,
  updates: Partial<{
    status: 'planned' | 'active' | 'completed' | 'archived';
    actualStartTime: string;
    actualEndTime: string;
    actualDurationMinutes: number;
    notes: string;
  }>
) {
  try {
    const { data, errors } = await client.models.Route.update({
      id: routeId,
      ...updates,
    });

    if (errors) {
      console.error('Errors updating route:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating route:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Subscribe to route updates in real-time
 */
export function subscribeToRoute(routeId: string, onUpdate: (route: any) => void) {
  const subscription = client.models.Route.observeQuery({
    filter: { id: { eq: routeId } },
  }).subscribe({
    next: (data) => {
      if (data.items && data.items.length > 0) {
        onUpdate(data.items[0]);
      }
    },
    error: (error) => {
      console.error('Subscription error:', error);
    },
  });

  return () => subscription.unsubscribe();
}
