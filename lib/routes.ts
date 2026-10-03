/**
 * The Route aggregate — a Route and its Stops — as the browser reads and
 * writes it through the signed-in user's data client. Every data-access
 * operation on Routes and Stops lives here; Sign Run writes go through
 * lib/signRunTransitions.ts, and the live feed through lib/useRouteWithStops.ts.
 *
 * Reads and writes return their data or throw a DataError
 * (lib/graphqlResult.ts); a Route that doesn't exist is null. Two exceptions:
 * the Route Code label lookups never throw (a label must never stop a screen
 * loading), and the Sign Run writes -- updateRoute, updateRouteCustomerInstructions
 * and updateStopExecution -- keep the raw AppSync {data, errors}, since the Sign
 * Run outbox tells a write to retry from one the server refused by its errors.
 */

import { getDataClient } from '@/lib/data-client';
import { DataError, resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';
import { unlinkRecordsOfDeletedRoute, type LinkClient } from '@/lib/routeRequestLinks';
import type { RouteStatus } from '@/amplify/types';
import { pickStopLocationFields, type StopLocationWrite } from '@/lib/locationPrecision';
import { stopPropertyKey, type StopAddressComponents } from '@/lib/propertyKey';
import { lacksProperty, locateEditedStop, locateNewStop, type LocatedStop, type StopAddressInput } from '@/lib/stopLocation';

/** Every Route a Customer owns -- see lib/listAll.ts. */
export async function listCustomerRoutes(customerId: string) {
  return withDataError('Failed to load routes.', async () =>
    resultData(await listAll(getDataClient(), 'Route', { filter: { customerId: { eq: customerId } } })) ?? []
  );
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
  return withDataError('Failed to load stops.', () => readStopsForRoute(routeId));
}

async function readStopsForRoute(routeId: string) {
  return resultData(await listAll(getDataClient(), 'Stop', { filter: { routeId: { eq: routeId } } })) ?? [];
}

/**
 * A Route and every one of its Stops, in sequence order; null when the Route
 * doesn't exist. A partial Stop read throws rather than return a Route with
 * Stops missing.
 */
export async function getRouteWithStops(routeId: string) {
  return withDataError('Failed to load route.', async () => {
    const route = resultData(await getDataClient().models.Route.get({ id: routeId }));
    if (!route) return null;

    const stops = await readStopsForRoute(routeId);
    return { route, stops: [...stops].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)) };
  });
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
  pickupDate: string;
  notes?: string;
}) {
  return withDataError('Failed to create route.', async () => {
    const route = resultData(await getDataClient().models.Route.create(input));
    if (!route) throw new Error('The created Route was not returned.');
    return route;
  });
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
    pickupDate: string;
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

/** Deletes a Route and its Stops; nothing is returned. */
export async function deleteRoute(routeId: string): Promise<void> {
  return withDataError('Failed to delete route.', async () => {
    const client = getDataClient();
    // A single unpaginated Stop.list call only sees the first page — routes
    // with more stops than that would have the rest silently orphaned. Page
    // through every stop first, same as listAllStopsForRoute's other callers.
    const stops = await readStopsForRoute(routeId);

    const stopDeletes = await Promise.all(stops.map((stop) => client.models.Stop.delete({ id: stop.id })));
    stopDeletes.forEach(resultData);

    // Its Route Request and Amendments are kept, back in the inbox (ADR 0008).
    const { data: route } = await client.models.Route.get({ id: routeId }, { selectionSet: ['routeCode'] });
    const unlinkErrors = await unlinkRecordsOfDeletedRoute(
      client as unknown as LinkClient,
      routeId,
      route?.routeCode || routeId.slice(0, 8)
    );
    if (unlinkErrors.length > 0) resultData({ errors: unlinkErrors });

    resultData(await client.models.Route.delete({ id: routeId }));
  });
}

export interface StopExecutionUpdateInput {
  actualArrivalTime?: string;
  actualDepartureTime?: string;
  notes?: string;
  missingSignsCount?: number;
  missingSignsLastLoggedAt?: string;
  missingSignsLastLatitude?: number;
  missingSignsLastLongitude?: number;
  placedLatitude?: number;
  placedLongitude?: number;
  placedAccuracyMeters?: number;
  placedPositionAt?: string;
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
 * The Stop location fields a caller may write. The Property key isn't one of
 * them: every Stop write builds it here (stopPropertyKey).
 */
type StopLocationInput = StopLocationWrite;

/** Whether a write sets any address component -- to a value, or null to clear it. */
function writesAddressComponents(fields: StopAddressComponents): boolean {
  return (
    fields.addressStreetNumber !== undefined ||
    fields.addressStreet !== undefined ||
    fields.addressSuburb !== undefined ||
    fields.addressPostcode !== undefined
  );
}

/** The input minus any Property key a caller passed despite the types. */
function withoutPropertyKey<T extends object>(input: T): T {
  const fields = { ...input } as T & { propertyKey?: unknown };
  delete fields.propertyKey;
  return fields;
}

/**
 * Create a stop within a route. Customers read Stops only through viewerSubs,
 * so a Stop is stamped with the customer's current viewers -- looked up here
 * unless the caller passes them. Its Property key is built from the address
 * (stopPropertyKey); one passed in is ignored.
 */
export async function createStop(input: NewStopInput) {
  return withDataError('Failed to create stop.', () => writeNewStop(input));
}

type NewStopInput = StopLocationInput & {
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
};

async function writeNewStop(input: NewStopInput) {
  const fields = withoutPropertyKey(input);
  const key = stopPropertyKey(fields.address, fields);
  const stop = key ? { ...fields, propertyKey: key } : fields;
  const viewerSubs = input.viewerSubs ?? (await getCustomerViewerSubs(input.customerId));
  return resultData(await getDataClient().models.Stop.create(viewerSubs ? { ...stop, viewerSubs } : stop));
}

export interface CreateStopsForRouteInput extends StopLocationInput {
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
 * callers can report which specific stops failed and why. A stop with no pin
 * and no suburb isn't created (STOP_NEEDS_SUBURB), e.g. one copied from an
 * older Route.
 */
export async function createStopsForRoute(
  routeId: string,
  customerId: string,
  stops: CreateStopsForRouteInput[]
): Promise<CreateStopsForRouteResult[]> {
  const viewerSubs = await getCustomerViewerSubs(customerId);

  return Promise.all(
    stops.map(async (stop, index) => {
      const location = { fields: pickStopLocationFields(stop), pinned: typeof stop.latitude === 'number' };
      if (lacksProperty(stop.address, location)) {
        return { index, address: stop.address, success: false, errorMessage: STOP_NEEDS_SUBURB };
      }

      try {
        await createStop({
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
      } catch (error) {
        return { index, address: stop.address, success: false, errorMessage: (error as Error).message };
      }

      return { index, address: stop.address, success: true };
    })
  );
}

/** Every Route (operators, no customer filter), paginated through to the
 * end -- see lib/listAll.ts. */
export async function listAllRoutes() {
  return withDataError('Failed to load routes.', async () => resultData(await listAll(getDataClient(), 'Route')) ?? []);
}

/** Every Stop (admin dashboard aggregation — signs in field, stops
 * serviced), paginated through to the end -- see lib/listAll.ts. */
export async function listAllStops() {
  return withDataError('Failed to load stops.', async () => resultData(await listAll(getDataClient(), 'Stop')) ?? []);
}

/**
 * Update a stop by ID
 */
export interface UpdateStopInput extends StopLocationInput {
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
  notes?: string;
}

/**
 * The update with the Stop's Property key rebuilt, when the update writes an
 * address. When the update doesn't write address components, the stored ones
 * still describe the address if it hasn't changed; a changed address is keyed
 * from its text. A
 * key that can't be built is left as stored -- propertyKey is an index key, so
 * it isn't cleared.
 */
async function withStopPropertyKey(fields: Omit<UpdateStopInput, 'address'> & { address: string }) {
  let components: StopAddressComponents = fields;
  if (!writesAddressComponents(fields)) {
    const stored = resultData(
      await getDataClient().models.Stop.get(
        { id: fields.id },
        { selectionSet: ['address', 'addressStreetNumber', 'addressStreet', 'addressSuburb', 'addressPostcode'] }
      )
    );
    components = stored?.address?.trim() === fields.address.trim() ? stored : {};
  }

  const key = stopPropertyKey(fields.address, components);
  return key ? { ...fields, propertyKey: key } : fields;
}

/**
 * Update a Stop. One that writes an address has its Property key rebuilt
 * (withStopPropertyKey); a key passed in is ignored.
 */
export async function updateStop(input: UpdateStopInput) {
  return withDataError('Failed to update stop.', () => writeStopUpdate(input));
}

async function writeStopUpdate(input: UpdateStopInput) {
  const fields = withoutPropertyKey(input);
  const { address } = fields;
  const update = address === undefined ? fields : await withStopPropertyKey({ ...fields, address });
  return resultData(await getDataClient().models.Stop.update(update as any));
}

/** What the Stop form submits besides the address. */
export interface StopDetails {
  serviceType: 'delivery' | 'pickup' | 'inspection';
  numberOfSigns?: number;
  agent?: string;
  isAuction?: boolean;
  notes?: string;
}

/** Where a new Stop goes on its Route. */
export interface NewStopTarget {
  routeId: string;
  customerId: string;
  sequence: number;
}

/** The Stop an edit changes, as last read. */
export interface EditedStopTarget {
  original: LocatedStop & { id: string };
}

/**
 * Add a Stop to a Route, or save an edit to one, from what the Stop form
 * submitted. The Stop is located (lib/stopLocation.ts: the autocomplete pick,
 * else a geocode, and a Property's Confirmed pin over either) and written. A
 * Stop whose address can't be geocoded is still saved, without a map pin
 * (`pinned: false`); an edit that moves a Stop to such an address clears the
 * old address's pin. Unless the address names a suburb, though, nothing is
 * saved (STOP_NEEDS_SUBURB). A failed Confirmed-pin lookup fails the save.
 * Throws a DataError: STOP_NEEDS_SUBURB, or 'Failed to save stop.'.
 */
export async function saveStop(target: NewStopTarget, values: StopAddressInput & StopDetails): Promise<SaveStopResult>;
export async function saveStop(
  target: EditedStopTarget,
  values: StopAddressInput & Partial<StopDetails>
): Promise<SaveStopResult>;
export async function saveStop(
  target: NewStopTarget | EditedStopTarget,
  { resolvedLocation, ...values }: StopAddressInput & Partial<StopDetails>
): Promise<SaveStopResult> {
  const addressInput = { address: values.address, resolvedLocation };
  return withDataError('Failed to save stop.', async () => {
    if ('original' in target) {
      const location = await locateEditedStop(target.original, addressInput);
      const addressChanged = target.original.address?.trim() !== values.address.trim();
      if (addressChanged && lacksProperty(values.address, location)) throw new DataError(STOP_NEEDS_SUBURB);
      await writeStopUpdate({ id: target.original.id, ...values, ...location.fields });
      return { pinned: location.pinned };
    }

    const location = await locateNewStop(addressInput);
    if (lacksProperty(values.address, location)) throw new DataError(STOP_NEEDS_SUBURB);
    await writeNewStop({ ...target, ...(values as StopAddressInput & StopDetails), ...location.fields });
    return { pinned: location.pinned };
  });
}

/** Why a Stop wasn't saved: no pin, and no suburb to find it by later (lib/stopLocation.ts lacksProperty). */
export const STOP_NEEDS_SUBURB =
  "This address couldn't be found on the map. Add the suburb so the Stop can be found later.";

/** What to tell someone whose Stop wasn't saved: STOP_NEEDS_SUBURB, else `fallback`. */
export function saveStopFailure(error: unknown, fallback: string): string {
  return error instanceof Error && error.message === STOP_NEEDS_SUBURB ? STOP_NEEDS_SUBURB : fallback;
}

/** What to tell someone whose Stop saved without a pin (SaveStopResult.pinned). */
export const UNPINNED_STOP_NOTICE =
  "Stop saved without a map pin: its address couldn't be found on the map. It still appears in Property History.";

export interface SaveStopResult {
  /** Whether the saved Stop has a map pin; false when its address couldn't be geocoded. */
  pinned: boolean;
}

/**
 * Delete a stop by ID
 */
export async function deleteStop(stopId: string): Promise<void> {
  return withDataError('Failed to delete stop.', async () => {
    resultData(await getDataClient().models.Stop.delete({ id: stopId }));
  });
}

/** Every Stop a Customer owns, across all its Routes -- see lib/listAll.ts. */
export async function listCustomerStops(customerId: string) {
  return withDataError('Failed to load stops.', async () =>
    resultData(await listAll(getDataClient(), 'Stop', { filter: { customerId: { eq: customerId } } })) ?? []
  );
}

/**
 * Renumbers a Route's Stops to match `stopIds` (sequence 1, 2, ...). The
 * writes run concurrently; rejects if any of them fails, leaving the caller
 * to resync.
 */
export async function resequenceStops(stopIds: string[]): Promise<void> {
  return withDataError('Failed to save stop order.', async () => {
    const client = getDataClient();
    const results = await Promise.all(
      stopIds.map((id, index) => client.models.Stop.update({ id, sequence: index + 1 }))
    );
    results.forEach(resultData);
  });
}
