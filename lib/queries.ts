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

    const sortedStops = [...(stops || [])].sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
    );

    return { route, stops: sortedStops, errors: stopsErrors || [] };
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

export interface RouteExecutionUpdateInput {
  status?: 'planned' | 'active' | 'completed' | 'archived';
  actualStartTime?: string;
  actualEndTime?: string;
  actualDurationMinutes?: number;
}

/**
 * Execution-only route updates for operators (status and timing fields only).
 */
export async function updateRouteExecution(routeId: string, updates: RouteExecutionUpdateInput) {
  return updateRoute(routeId, updates);
}

export interface StopExecutionUpdateInput {
  actualArrivalTime?: string;
  actualDepartureTime?: string;
}

/**
 * Execution-only stop updates for operators (actual timing fields only).
 */
export async function updateStopExecution(stopId: string, updates: StopExecutionUpdateInput) {
  try {
    const { data, errors } = await client.models.Stop.update({
      id: stopId,
      ...updates,
    });

    if (errors) {
      console.error('Errors updating stop execution fields:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating stop execution fields:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Create a stop within a route.
 * customerId MUST be the owning customer's identity (sub) so the tenant-based
 * ownerDefinedIn('customerId') authorization rule grants customer read access.
 */
export async function createStop(input: {
  routeId: string;
  customerId: string;
  sequence: number;
  address: string;
  serviceType: 'delivery' | 'pickup' | 'inspection';
  estimatedArrivalTime?: string;
  numberOfSigns?: number;
  agent?: string;
  isAuction?: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  notes?: string;
}) {
  try {
    const { data, errors } = await client.models.Stop.create(input);

    if (errors) {
      console.error('Errors creating stop:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating stop:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Fetch operator-visible routes.
 */
export async function listOperatorRoutes(options?: { limit?: number; nextToken?: string }) {
  try {
    const { data, errors } = await client.models.Route.list({
      limit: options?.limit || 20,
      nextToken: options?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching operator routes:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors };
  } catch (error) {
    console.error('Error listing operator routes:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Fetch one route and all ordered stops for operator consumption.
 */
export async function getOperatorRouteDetail(routeId: string) {
  return getRouteWithStops(routeId);
}

/**
 * Create an invoice for a customer.
 */
export async function createInvoice(input: {
  customerId: string;
  invoiceNumber: string;
  invoiceDate: string;
  periodStartDate?: string;
  periodEndDate?: string;
  totalAmount: number;
  status: 'draft' | 'finalized' | 'sent' | 'paid';
}) {
  try {
    const { data, errors } = await client.models.Invoice.create(input);

    if (errors) {
      console.error('Errors creating invoice:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating invoice:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Create a line item on an invoice.
 * customerId MUST be the owning customer's identity (sub) so the tenant-based
 * ownerDefinedIn('customerId') authorization rule grants customer read access.
 */
export async function createLineItem(input: {
  invoiceId: string;
  routeId?: string;
  customerId: string;
  description: string;
  quantity?: number;
  ratePerUnit: number;
  amount: number;
}) {
  try {
    const { data, errors } = await client.models.LineItem.create(input);

    if (errors) {
      console.error('Errors creating line item:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating line item:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Create a payment record for a customer.
 */
export async function createPaymentRecord(input: {
  customerId: string;
  invoiceId?: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'credit_card' | 'bank_transfer' | 'check' | 'other';
  referenceNumber?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  notes?: string;
}) {
  try {
    const { data, errors } = await client.models.PaymentRecord.create(input);

    if (errors) {
      console.error('Errors creating payment record:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating payment record:', error);
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
