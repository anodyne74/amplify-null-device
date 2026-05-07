/**
 * GraphQL-like query helpers for Amplify Data
 * These utilities encapsulate the data fetching patterns and enable type-safe operations
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';

let _client: ReturnType<typeof generateClient<Schema>> | null = null;
function getClient() {
  if (!_client) _client = generateClient<Schema>();
  return _client;
}

function getCustomerUserModel() {
  const model = (getClient().models as unknown as Record<string, unknown>).CustomerUser as
    | {
        list: (args: unknown) => Promise<{ data?: unknown[]; errors?: unknown[] }>;
        create: (args: unknown) => Promise<{ data?: unknown; errors?: unknown[] }>;
        delete: (args: unknown) => Promise<{ data?: unknown; errors?: unknown[] }>;
      }
    | undefined;

  if (!model) {
    return {
      model: null,
      error: new Error(
        'CustomerUser model is not available in the current backend schema. Deploy backend changes and refresh amplify outputs.'
      ),
    };
  }

  return { model, error: null };
}

/**
 * Fetch all customers
 * Used by operators to view all customers in the system
 */
export async function listCustomers(options?: { limit?: number; nextToken?: string }) {
  try {
    const { data, errors } = await getClient().models.Customer.list({
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
    const { data, errors } = await getClient().models.Customer.get({ id: customerId });
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
 * Create a customer record.
 */
export async function createCustomer(input: {
  name: string;
  email: string;
  contactPhone?: string;
  addressLine1?: string;
  status?: 'active' | 'inactive' | 'suspended';
  billingRatePerHour: number;
}) {
  try {
    const { data, errors } = await getClient().models.Customer.create(input);

    if (errors) {
      console.error('Errors creating customer:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating customer:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Update an existing customer.
 */
export async function updateCustomer(
  customerId: string,
  updates: Partial<{
    name: string;
    email: string;
    contactPhone: string;
    addressLine1: string;
    status: 'active' | 'inactive' | 'suspended';
    billingRatePerHour: number;
  }>
) {
  try {
    const { data, errors } = await getClient().models.Customer.update({
      id: customerId,
      ...updates,
    });

    if (errors) {
      console.error('Errors updating customer:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating customer:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Delete a customer record.
 */
export async function deleteCustomer(customerId: string) {
  try {
    const { data, errors } = await getClient().models.Customer.delete({ id: customerId });

    if (errors) {
      console.error('Errors deleting customer:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error deleting customer:', error);
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
    const { data, errors } = await getClient().models.Route.list({
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
    const { data: route, errors: routeErrors } = await getClient().models.Route.get({ id: routeId });

    if (routeErrors) {
      console.error('Errors fetching route:', routeErrors);
      return { route: null, stops: [], errors: routeErrors };
    }

    if (!route) {
      return { route: null, stops: [], errors: [] };
    }

    // Fetch stops for this route
    const { data: stops, errors: stopsErrors } = await getClient().models.Stop.list({
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
    const { data, errors } = await getClient().models.Invoice.list({
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
 * Fetch all invoices for administrators/operators.
 */
export async function listInvoices(options?: {
  limit?: number;
  nextToken?: string;
  status?: 'draft' | 'finalized' | 'sent' | 'paid';
}) {
  try {
    const { data, errors } = await getClient().models.Invoice.list({
      limit: options?.limit || 20,
      nextToken: options?.nextToken,
    });

    if (errors) {
      console.error('Errors fetching invoices:', errors);
      return { data: [], errors };
    }

    const filtered = options?.status
      ? (data || []).filter((invoice) => invoice.status === options.status)
      : (data || []);

    return { data: filtered, errors };
  } catch (error) {
    console.error('Error listing invoices:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Fetch a specific invoice with its line items
 */
export async function getInvoiceWithLineItems(invoiceId: string) {
  try {
    const { data: invoice, errors: invoiceErrors } = await getClient().models.Invoice.get({
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
    const { data: lineItems, errors: lineItemsErrors } = await getClient().models.LineItem.list({
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
  routeCode?: string;
  customerId: string;
  viewerSubs?: string[];
  status: 'planned' | 'active' | 'completed' | 'archived';
  notes?: string;
  scheduleS3Key?: string;
}) {
  try {
    const { data, errors } = await getClient().models.Route.create(input);

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
    routeCode: string;
    customerId: string;
    status: 'planned' | 'active' | 'completed' | 'archived';
    actualStartTime: string;
    actualEndTime: string;
    actualDurationMinutes: number;
    notes: string;
    scheduleS3Key: string;
  }>
) {
  try {
    const { data, errors } = await getClient().models.Route.update({
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

export async function deleteRoute(routeId: string) {
  try {
    const client = getClient();
    const { data: stops, errors: stopListErrors } = await client.models.Stop.list({
      filter: { routeId: { eq: routeId } },
    });

    if (stopListErrors && stopListErrors.length > 0) {
      console.error('Errors fetching route stops for deletion:', stopListErrors);
      return { data: null, errors: stopListErrors };
    }

    const stopDeletes = await Promise.all(
      ((stops as Array<{ id: string }>) || []).map((stop) => client.models.Stop.delete({ id: stop.id }))
    );

    const childErrors = stopDeletes.flatMap((result) => result.errors || []);
    if (childErrors.length > 0) {
      console.error('Errors deleting route stops:', childErrors);
      return { data: null, errors: childErrors };
    }

    const { data, errors } = await client.models.Route.delete({ id: routeId });

    if (errors) {
      console.error('Errors deleting route:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error deleting route:', error);
    return { data: null, errors: [error] };
  }
}

export interface StopExecutionUpdateInput {
  actualArrivalTime?: string;
  actualDepartureTime?: string;
  notes?: string;
}

/**
 * Execution-only stop updates for operators (actual timing fields only).
 */
export async function updateStopExecution(stopId: string, updates: StopExecutionUpdateInput) {
  try {
    const { data, errors } = await getClient().models.Stop.update({
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
  viewerSubs?: string[];
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
    const { data, errors } = await getClient().models.Stop.create(input);

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
    const { data, errors } = await getClient().models.Route.list({
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
  routeId?: string;
  pdfS3Key?: string;
}) {
  try {
    const { data, errors } = await getClient().models.Invoice.create(input);

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
 * Update invoice lifecycle and totals.
 */
export async function updateInvoice(
  invoiceId: string,
  updates: Partial<{
    invoiceNumber: string;
    invoiceDate: string;
    periodStartDate: string;
    periodEndDate: string;
    totalAmount: number;
    status: 'draft' | 'finalized' | 'sent' | 'paid';
    routeId: string | null;
    pdfS3Key: string;
  }>
) {
  try {
    const { data, errors } = await getClient().models.Invoice.update({
      id: invoiceId,
      ...updates,
    });

    if (errors) {
      console.error('Errors updating invoice:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating invoice:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Convenience helper — saves the S3 key of an uploaded PDF to the invoice record.
 */
export async function updateInvoicePdfKey(invoiceId: string, pdfS3Key: string) {
  return updateInvoice(invoiceId, { pdfS3Key });
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
    const { data, errors } = await getClient().models.LineItem.create(input);

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
    const { data, errors } = await getClient().models.PaymentRecord.create(input);

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
  const subscription = getClient().models.Route.observeQuery({
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

/**
 * List all CustomerUser records for a given customer.
 * Only accessible by administrators.
 */
export async function listCustomerUsers(customerId: string) {
  try {
    const { model, error: modelError } = getCustomerUserModel();
    if (!model) {
      return { data: [], errors: [modelError] };
    }

    const { data, errors } = await model.list({
      filter: { customerId: { eq: customerId } },
    });
    if (errors) {
      console.error('Errors listing customer users:', errors);
    }
    return { data: data || [], errors };
  } catch (error) {
    console.error('Error listing customer users:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Resolve customer portal context for a user sub.
 * Fallback behavior preserves legacy owner access where customerId === userSub.
 */
export async function getCustomerPortalContext(userSub: string): Promise<{
  role: 'account_owner' | 'read_only';
  customerId: string;
  errors?: unknown[];
}> {
  try {
    const { model, error: modelError } = getCustomerUserModel();
    if (!model) {
      return {
        role: 'account_owner',
        customerId: userSub,
        errors: [modelError],
      };
    }

    const { data, errors } = await model.list({
      filter: { userSub: { eq: userSub } },
      limit: 100,
    });

    const rows = (data as Array<{
      role?: 'account_owner' | 'read_only' | null;
      customerId?: string | null;
    }> | undefined) || [];

    const ownerRow = rows.find((row) => row.role === 'account_owner' && row.customerId);
    if (ownerRow?.customerId) {
      return { role: 'account_owner', customerId: ownerRow.customerId, errors };
    }

    const reviewerRow = rows.find((row) => row.role === 'read_only' && row.customerId);
    if (reviewerRow?.customerId) {
      return { role: 'read_only', customerId: reviewerRow.customerId, errors };
    }

    // Legacy fallback: older records may still use sub as customerId.
    return { role: 'account_owner', customerId: userSub, errors };
  } catch (error) {
    console.error('Error resolving customer portal context:', error);
    return {
      role: 'account_owner',
      customerId: userSub,
      errors: [error],
    };
  }
}

/**
 * Create a CustomerUser record linking a Cognito user to a customer.
 * Only accessible by administrators.
 * accountOwnerSub must be the account owner's Cognito sub (same for all rows per customer).
 */
export async function createCustomerUser(input: {
  customerId: string;
  userSub: string;
  accountOwnerSub: string;
  role: 'account_owner' | 'read_only';
  name?: string;
  email?: string;
}) {
  try {
    const { model, error: modelError } = getCustomerUserModel();
    if (!model) {
      return { data: null, errors: [modelError] };
    }

    const { data, errors } = await model.create(input);
    if (errors) {
      console.error('Errors creating customer user:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error creating customer user:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Delete a CustomerUser record by ID.
 * Only accessible by administrators.
 */
export async function deleteCustomerUser(customerUserId: string) {
  try {
    const { model, error: modelError } = getCustomerUserModel();
    if (!model) {
      return { data: null, errors: [modelError] };
    }

    const { data, errors } = await model.delete({ id: customerUserId });
    if (errors) {
      console.error('Errors deleting customer user:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error deleting customer user:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Sync the viewerSubs array on every Route and Stop belonging to a customer.
 * Must be called after adding or removing a CustomerUser so read-only users
 * gain / lose access to existing records.
 *
 * viewerSubs should contain the Cognito subs of ALL CustomerUsers for the customer
 * (both account_owner and read_only) so every user can read every route/stop.
 */
export async function syncViewerSubsForCustomer(
  customerId: string,
  viewerSubs: string[]
): Promise<{ updatedRoutes: number; updatedStops: number; errors: unknown[] }> {
  const allErrors: unknown[] = [];
  let updatedRoutes = 0;
  let updatedStops = 0;

  try {
    // Fetch all routes for this customer
    const { data: routes, errors: routeErrors } = await getClient().models.Route.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
    });
    if (routeErrors) allErrors.push(...routeErrors);

    for (const route of routes || []) {
      // Update route viewerSubs
      const { errors: routeUpdateErrors } = await getClient().models.Route.update({
        id: route.id,
        viewerSubs,
      });
      if (routeUpdateErrors) allErrors.push(...routeUpdateErrors);
      else updatedRoutes++;

      // Fetch and update all stops for this route
      const { data: stops, errors: stopListErrors } = await getClient().models.Stop.list({
        filter: { routeId: { eq: route.id } },
        limit: 1000,
      });
      if (stopListErrors) allErrors.push(...stopListErrors);

      for (const stop of stops || []) {
        const { errors: stopUpdateErrors } = await getClient().models.Stop.update({
          id: stop.id,
          viewerSubs,
        });
        if (stopUpdateErrors) allErrors.push(...stopUpdateErrors);
        else updatedStops++;
      }
    }
  } catch (error) {
    console.error('Error syncing viewer subs:', error);
    allErrors.push(error);
  }

  if (allErrors.length > 0) {
    console.error(`syncViewerSubsForCustomer completed with ${allErrors.length} error(s):`, allErrors);
  }

  return { updatedRoutes, updatedStops, errors: allErrors };
}
