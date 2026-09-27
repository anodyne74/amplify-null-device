/**
 * The Route aggregate — a Route and its Stops — as the browser reads and
 * writes it through the signed-in user's data client. Every data-access
 * operation on Routes and Stops lives here; Sign Run writes go through
 * lib/signRunTransitions.ts, and the live feed through lib/useRouteWithStops.ts.
 */

import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';
import type { RouteStatus } from '@/amplify/types';
import { pickStopLocationFields, type StopLocationFields } from '@/lib/locationPrecision';

/**
 * Fetch all routes for a specific customer
 */
export async function listCustomerRoutes(
  customerId: string,
  options?: { status?: string }
) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Route', {
      filter: { customerId: { eq: customerId } },
    });

    if (errors.length > 0) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors };
    }

    let routes = data;

    // Apply status filter if provided (client-side filtering as Amplify doesn't support complex filters)
    if (options?.status) {
      routes = routes.filter((route) => route.status === options.status);
    }

    return { data: routes, errors: undefined };
  } catch (error) {
    console.error('Error listing customer routes:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Route Codes by route ID, for screens that only need to label a route (the
 * customer invoice list). A label must never stop the caller loading, so a
 * failed lookup returns what it could read, and callers fall back to a short ID.
 */
export async function listCustomerRouteCodes(customerId: string): Promise<Map<string, string>> {
  const codes = new Map<string, string>();
  try {
    const { data, errors } = await listAll(getDataClient(), 'Route', {
      filter: { customerId: { eq: customerId } },
      selectionSet: ['id', 'routeCode'],
    });
    if (errors.length > 0) {
      console.warn('Some route codes could not be read:', errors);
    }
    for (const route of data) {
      if (route.id && route.routeCode) codes.set(route.id, route.routeCode);
    }
  } catch (error) {
    console.warn('Could not read route codes:', error);
  }
  return codes;
}

/** One route's Route Code; undefined when it has none or can't be read. */
export async function getRouteCode(routeId: string): Promise<string | undefined> {
  try {
    const { data } = await getDataClient().models.Route.get({ id: routeId }, { selectionSet: ['id', 'routeCode'] });
    return data?.routeCode || undefined;
  } catch (error) {
    console.warn('Could not read route code:', error);
    return undefined;
  }
}

/**
 * Fetches every Stop for a route (see lib/listAll.ts for why one page isn't
 * enough).
 */
export async function listAllStopsForRoute(routeId: string) {
  const { data: stops, errors } = await listAll(getDataClient(), 'Stop', {
    filter: { routeId: { eq: routeId } },
  });

  if (errors.length > 0) {
    console.error('Errors fetching stops:', errors);
  }

  return { stops, errors };
}

/**
 * Fetch a specific route with all its stops
 */

export async function getRouteWithStops(routeId: string) {
  try {
    const { data: route, errors: routeErrors } = await getDataClient().models.Route.get({ id: routeId });

    if (routeErrors) {
      console.error('Errors fetching route:', routeErrors);
      return { route: null, stops: [], errors: routeErrors };
    }

    if (!route) {
      return { route: null, stops: [], errors: [] };
    }

    const { stops: allStops, errors: allStopErrors } = await listAllStopsForRoute(routeId);

    const sortedStops = [...allStops].sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
    );

    return { route, stops: sortedStops, errors: allStopErrors };
  } catch (error) {
    console.error('Error getting route with stops:', error);
    return { route: null, stops: [], errors: [error] };
  }
}

/**
 * Create a new route for a customer
 */
export async function createRoute(input: {
  routeCode?: string;
  customerId: string;
  viewerSubs?: string[];
  status: RouteStatus;
  executionPhase?: 'load' | 'placement' | 'pickup' | 'unload';
  scheduledDate?: string;
  notes?: string;
  scheduleS3Key?: string;
}) {
  try {
    const { data, errors } = await getDataClient().models.Route.create(input);

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
    status: RouteStatus;
    executionPhase: 'load' | 'placement' | 'pickup' | 'unload';
    actualStartTime: string;
    actualEndTime: string;
    placementStartTime: string;
    placementEndTime: string;
    pickupStartTime: string;
    pickupEndTime: string;
    actualDurationMinutes: number;
    signsPlacedDistanceKm: number;
    signsPickedUpDistanceKm: number;
    overrideSigns: number;
    overrideStops: number;
    overrideDistanceKm: number;
    overrideDurationMinutes: number;
    overrideRate: number;
    overrideAmount: number;
    notes: string;
    customerInstructions: string;
    customerFeedbackTone: 'good' | 'issue';
    customerFeedbackNote: string;
    drivingModeEnabled: boolean;
    loadStartedAt: string;
    loadConfirmedAt: string;
    loadedSignsCount: number;
    unloadStartedAt: string;
    unloadConfirmedAt: string;
    billedLoadMinutes: number;
    billedPlacementMinutes: number;
    billedPickupMinutes: number;
    billedUnloadMinutes: number;
    vanCount: number;
    scheduleS3Key: string;
    assignedOperatorSub: string | null;
    assignedOperatorName: string | null;
    assignedOperatorEmail: string | null;
    assignedAt: string | null;
  }>
) {
  try {
    const { data, errors } = await getDataClient().models.Route.update({
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
 * Customer-facing update: lets a customer user (account_owner or read_only) add or
 * change their instructions for a route. Scoped to this one field by convention — the
 * underlying `Route` authorization grant is coarse (see amplify/data/resource.ts).
 */
export async function updateRouteCustomerInstructions(routeId: string, customerInstructions: string) {
  return updateRoute(routeId, { customerInstructions });
}

export async function deleteRoute(routeId: string) {
  try {
    const client = getDataClient();
    // A single unpaginated Stop.list call only sees the first page — routes
    // with more stops than that would have the rest silently orphaned. Page
    // through every stop first, same as listAllStopsForRoute's other callers.
    const { stops, errors: stopListErrors } = await listAllStopsForRoute(routeId);

    if (stopListErrors.length > 0) {
      console.error('Errors fetching route stops for deletion:', stopListErrors);
      return { data: null, errors: stopListErrors };
    }

    const stopDeletes = await Promise.all(
      (stops as Array<{ id: string }>).map((stop) => client.models.Stop.delete({ id: stop.id }))
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
  missingSignsCount?: number;
  missingSignsLastLoggedAt?: string;
  missingSignsLastLatitude?: number;
  missingSignsLastLongitude?: number;
}

/**
 * Execution-only stop updates for operators (actual timing fields only).
 */
export async function updateStopExecution(stopId: string, updates: StopExecutionUpdateInput) {
  try {
    const { data, errors } = await getDataClient().models.Stop.update({
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
 * The customer's current viewers (Customer.viewerSubs), which a new Stop needs
 * for customer read access. On failure this logs and returns undefined: the
 * Stop is still created, and syncCustomerAccess stamps it on the customer's
 * next portal visit.
 */
async function getCustomerViewerSubs(customerId: string): Promise<string[] | undefined> {
  try {
    const { data, errors } = await getDataClient().models.Customer.get({ id: customerId }, { selectionSet: ['viewerSubs'] });

    if (errors) {
      console.error(`Errors reading viewers for customer ${customerId}:`, errors);
      return undefined;
    }

    return (data?.viewerSubs ?? []).filter((sub): sub is string => Boolean(sub));
  } catch (error) {
    console.error(`Error reading viewers for customer ${customerId}:`, error);
    return undefined;
  }
}

/**
 * Create a stop within a route. Customers read Stops only through viewerSubs,
 * so a Stop is stamped with the customer's current viewers -- looked up here
 * unless the caller passes them.
 */
export async function createStop(input: Partial<StopLocationFields> & {
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
    const viewerSubs = input.viewerSubs ?? (await getCustomerViewerSubs(input.customerId));
    const { data, errors } = await getDataClient().models.Stop.create(viewerSubs ? { ...input, viewerSubs } : input);

    if (errors) {
      console.error('Errors creating stop:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating stop:', error);
    return { data: null, errors: [error] };
  }
}

export interface CreateStopsForRouteInput extends Partial<StopLocationFields> {
  address: string;
  serviceType: 'delivery' | 'pickup' | 'inspection';
  numberOfSigns?: number;
  agent?: string;
  isAuction?: boolean;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  notes?: string;
}

export interface CreateStopsForRouteResult {
  index: number;
  address: string;
  success: boolean;
  errorMessage?: string;
}

/**
 * Create every stop for a newly-created route concurrently, rather than one round
 * trip at a time — for routes with 15-28 stops a serial loop measurably delayed
 * route creation. Returns a per-stop success/failure result (in input order) so
 * callers can report which specific stops failed and why.
 */
export async function createStopsForRoute(
  routeId: string,
  customerId: string,
  stops: CreateStopsForRouteInput[]
): Promise<CreateStopsForRouteResult[]> {
  const viewerSubs = await getCustomerViewerSubs(customerId);

  return Promise.all(
    stops.map(async (stop, index) => {
      const stopResult = await createStop({
        routeId,
        customerId,
        viewerSubs,
        sequence: index + 1,
        address: stop.address,
        serviceType: stop.serviceType,
        numberOfSigns: stop.numberOfSigns,
        agent: stop.agent,
        isAuction: stop.isAuction,
        notes: stop.notes,
        ...pickStopLocationFields(stop),
      });

      if (stopResult.errors && stopResult.errors.length > 0) {
        const errorMessage = (stopResult.errors as Array<{ message?: string }>)
          .map((entry) => entry.message ?? String(entry))
          .join('; ') || 'Unknown stop creation error';
        return { index, address: stop.address, success: false, errorMessage };
      }

      return { index, address: stop.address, success: true };
    })
  );
}

/** Every Route (operators, no customer filter), paginated through to the
 * end -- see lib/listAll.ts. */
export async function listAllRoutes() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Route');

    if (errors.length > 0) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing all routes:', error);
    return { data: [], errors: [error as Error] };
  }
}

/**
 * List every route for a customer
 * Used to display route list in customer portal
 */
export interface ListMyRoutesParams {
  customerId: string;
}

export async function listMyRoutes(params: ListMyRoutesParams) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Route', {
      filter: {
        customerId: {
          eq: params.customerId,
        },
      },
    });

    if (errors.length > 0) {
      console.error('Errors fetching routes:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing customer routes:', error);
    return { data: [], errors: [error as Error] };
  }
}

/** Every Stop (admin dashboard aggregation — signs in field, stops
 * serviced), paginated through to the end -- see lib/listAll.ts. */
export async function listAllStops() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Stop');

    if (errors.length > 0) {
      console.error('Errors fetching stops:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing all stops:', error);
    return { data: [], errors: [error as Error] };
  }
}

/**
 * Update a stop by ID
 */
export interface UpdateStopInput extends Partial<StopLocationFields> {
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

/**
 * Delete a stop by ID
 */
export async function deleteStop(stopId: string) {
  try {
    const { data, errors } = await getDataClient().models.Stop.delete({ id: stopId });

    if (errors) {
      console.error('Errors deleting stop:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error deleting stop:', error);
    return { data: null, errors: [error as Error] };
  }
}

/** Every Stop a Customer owns, across all its Routes -- see lib/listAll.ts. */
export async function listCustomerStops(customerId: string) {
  return listAll(getDataClient(), 'Stop', { filter: { customerId: { eq: customerId } } });
}

/**
 * Renumbers a Route's Stops to match `stopIds` (sequence 1, 2, ...). The
 * writes run concurrently; rejects if any of them fails, leaving the caller
 * to resync.
 */
export async function resequenceStops(stopIds: string[]) {
  const client = getDataClient();
  const results = await Promise.all(
    stopIds.map((id, index) => client.models.Stop.update({ id, sequence: index + 1 }))
  );
  const errors = results.flatMap((result) => result.errors ?? []);
  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? 'Failed to save stop order.');
  }
}
