import { listAll, listAllPages } from '@/lib/listAll';
import { activeStops } from '@/lib/loadChange';
import {
  buildPropertyHistory,
  propertyKeyCondition,
  resolveRouteInvoices,
  type HistoryInvoice,
  type HistoryRoute,
  type HistoryStop,
  type PropertyHistoryAudience,
  type PropertyHistoryFilters,
  type PropertyHistoryResult,
  type PropertyHistorySearch,
} from '@/lib/propertyHistory';

/**
 * The Property History search (#288) as the server runs it for both the
 * screens and report generation: fetch the matching Stops through the
 * propertyKey indexes, then their Routes and Invoices, and hand the lot to
 * lib/propertyHistory.ts. Pass the IAM client from authorizeIamRequest.
 *
 * A customer's search is scoped to their `customerId` -- the Customer resolved
 * from their own CustomerUser row, never the request -- whatever the filters
 * say, and every Stop is checked against it again after the query.
 *
 * Any failed read fails the whole search: a partial history would under-count
 * Visits rather than look broken.
 */

// The caller from authorizePropertyHistoryRequest fits this as it is.
type Scope = { audience: 'customer'; customerId: string } | { audience: 'administrator' };

const STOP_FIELDS = [
  'id',
  'routeId',
  'customerId',
  'propertyKey',
  'address',
  'agent',
  'isAuction',
  'numberOfSigns',
  'notes',
  'missingSignsCount',
  'locationPrecision',
  'removed',
] as const;
const ROUTE_FIELDS = [
  'id',
  'routeCode',
  'scheduledDate',
  'actualStartTime',
  'placementStartTime',
  'status',
  'customerId',
  'assignedOperatorName',
] as const;
const INVOICE_FIELDS = ['id', 'invoiceNumber', 'routeId', 'status', 'customerId'] as const;
// DynamoDB caps a filter expression's size; this many routeId terms stays well inside it.
const ROUTE_IDS_PER_FILTER = 50;

type PagedQuery = (args: object, options: object) => Promise<{ data: unknown[]; errors?: readonly unknown[] | null; nextToken?: string | null }>;
type Models = Record<string, Record<string, PagedQuery> & { get: (key: object, options?: object) => Promise<{ data: unknown; errors?: readonly unknown[] | null }> }>;

export class PropertyHistoryReadError extends Error {
  constructor(what: string, errors: readonly unknown[]) {
    super(`Could not read ${what}: ${errors.map((error) => (error as { message?: string })?.message ?? String(error)).join('; ')}`);
  }
}

function orThrow<T>(what: string, result: { data: T[]; errors: unknown[] }): T[] {
  if (result.errors.length > 0) throw new PropertyHistoryReadError(what, result.errors);
  return result.data;
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/** Each id's record, in parallel; ids with no record are left out. */
async function getEach<T>(models: Models, model: string, ids: readonly string[], selectionSet: readonly string[]): Promise<T[]> {
  const results = await Promise.all(ids.map((id) => models[model].get({ id }, { selectionSet })));
  const errors = results.flatMap((result) => result.errors ?? []);
  if (errors.length > 0) throw new PropertyHistoryReadError(`${model} records`, errors);
  return results.map((result) => result.data as T | null).filter((item): item is T => !!item);
}

async function stopsForCustomer(models: Models, customerId: string, search: PropertyHistorySearch): Promise<HistoryStop[]> {
  const query = models.Stop.listStopsByCustomerAndPropertyKey;
  return orThrow(
    'Stops',
    await listAllPages<HistoryStop>((page) =>
      query({ customerId, propertyKey: propertyKeyCondition(search) }, { selectionSet: STOP_FIELDS, ...page })
    )
  );
}

async function findStops(
  client: { models: object },
  search: PropertyHistorySearch,
  customerIds: readonly string[] | 'all'
): Promise<HistoryStop[]> {
  const models = client.models as Models;
  if (customerIds !== 'all') {
    return (await Promise.all(customerIds.map((id) => stopsForCustomer(models, id, search)))).flat();
  }
  if (search.level === 'address') {
    const query = models.Stop.listStopsByPropertyKey;
    return orThrow(
      'Stops',
      await listAllPages<HistoryStop>((page) => query({ propertyKey: search.propertyKey }, { selectionSet: STOP_FIELDS, ...page }))
    );
  }
  // The only index a suburb or street prefix can use is per Customer, so an
  // unfiltered staff search asks it once for each.
  const customers = orThrow('Customers', await listAll(client, 'Customer', { selectionSet: ['id'] }));
  return (await Promise.all(customers.map((customer) => stopsForCustomer(models, customer.id, search)))).flat();
}

async function getRoutes(client: { models: object }, routeIds: readonly string[]): Promise<Record<string, HistoryRoute>> {
  const routes = await getEach<HistoryRoute>(client.models as Models, 'Route', routeIds, ROUTE_FIELDS);
  return Object.fromEntries(routes.map((route) => [route.id, route]));
}

async function getCustomerNames(client: { models: object }, customerIds: readonly string[]): Promise<Record<string, string>> {
  const customers = await getEach<{ id: string; name: string }>(client.models as Models, 'Customer', customerIds, ['id', 'name']);
  return Object.fromEntries(customers.map((customer) => [customer.id, customer.name]));
}

async function getInvoicesByRoute(
  client: { models: object },
  routes: readonly HistoryRoute[],
  customerIds: readonly string[],
  audience: PropertyHistoryAudience
) {
  const routeIds = routes.map((route) => route.id);

  const [invoicePages, lineItemPages] = await Promise.all([
    Promise.all(
      customerIds.map((customerId) =>
        listAll(client, 'Invoice', { filter: { customerId: { eq: customerId } }, selectionSet: INVOICE_FIELDS })
      )
    ),
    Promise.all(
      chunks(routeIds, ROUTE_IDS_PER_FILTER).map((ids) =>
        listAll(client, 'LineItem', {
          filter: { or: ids.map((id) => ({ routeId: { eq: id } })) },
          selectionSet: ['invoiceId', 'routeId'],
        })
      )
    ),
  ]);
  const invoices = invoicePages.flatMap((page) => orThrow('Invoices', page)) as (HistoryInvoice & { customerId: string })[];
  const lineItems = lineItemPages.flatMap((page) => orThrow('Invoice line items', page));

  // A line item can put a Route on another Customer's Invoice; fetch those too.
  const loaded = new Set(invoices.map((invoice) => invoice.id));
  const missing = [...new Set(lineItems.map((item) => item.invoiceId))].filter((id) => !loaded.has(id));
  invoices.push(...(await getEach<HistoryInvoice & { customerId: string }>(client.models as Models, 'Invoice', missing, INVOICE_FIELDS)));

  // A customer only ever sees their own Customer's Invoices.
  const visible = audience === 'customer' ? invoices.filter((invoice) => customerIds.includes(invoice.customerId)) : invoices;
  return resolveRouteInvoices(visible, lineItems, audience);
}

export async function searchPropertyHistory(
  client: { models: object },
  scope: Scope,
  search: PropertyHistorySearch,
  requestedFilters: PropertyHistoryFilters
): Promise<PropertyHistoryResult> {
  const filters: PropertyHistoryFilters =
    scope.audience === 'customer' ? { ...requestedFilters, customerId: scope.customerId } : requestedFilters;
  const customerScope = filters.customerId ? [filters.customerId] : 'all';

  // A Stop a Load Change removed was never a Visit.
  const found = activeStops(await findStops(client, search, customerScope));
  const stops = scope.audience === 'customer' ? found.filter((stop) => stop.customerId === scope.customerId) : found;

  const routesById = await getRoutes(client, [...new Set(stops.map((stop) => stop.routeId))]);
  const routes = Object.values(routesById);
  const stopCustomerIds = [...new Set(stops.map((stop) => stop.customerId).filter((id): id is string => !!id))];

  const [invoicesByRouteId, customerNamesById] = await Promise.all([
    getInvoicesByRoute(client, routes, stopCustomerIds, scope.audience),
    scope.audience === 'administrator' ? getCustomerNames(client, stopCustomerIds) : Promise.resolve({}),
  ]);

  return buildPropertyHistory({
    search,
    filters,
    stops,
    routesById,
    invoicesByRouteId,
    customerNamesById,
    audience: scope.audience,
  });
}
