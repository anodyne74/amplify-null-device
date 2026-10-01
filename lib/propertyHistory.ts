/**
 * Property History (CONTEXT.md "Property History", "Visit"): the pure half of
 * the one search behind both the screens and the reports (#288), so an export
 * always matches what was on screen. lib/server/propertyHistory.ts fetches the
 * data; this module parses the request, groups, counts and shapes the rows.
 *
 * Grouping stops at the searched level: a suburb search returns Street ->
 * Property, a street search Property, an address search one Property. Only
 * Routes at signs_placed or later are Visits, and only those count; a Stop
 * skipped at placement is listed as Skipped but not counted; planned and
 * in-progress Routes come back separately as Scheduled.
 */
import type { RouteStatus } from '@/amplify/types';
import { comparePropertyKeys, parsePropertyKey, propertyKeyLabel, propertyKeyPrefix, streetKeyOf } from '@/lib/propertyKey';
import { getRouteRunDate } from '@/lib/routeDetailHelpers';
import { stopProgress } from '@/lib/stopProgress';

export type PropertyHistorySearch =
  | { level: 'suburb'; suburb: string; postcode?: string }
  | { level: 'street'; suburb: string; postcode: string; street: string }
  | { level: 'address'; propertyKey: string };

export interface PropertyHistoryFilters {
  /** Inclusive, against the Visit date (YYYY-MM-DD, see visitDate); an undated Visit never matches. */
  dateFrom?: string;
  dateTo?: string;
  agent?: string;
  auction?: boolean;
  /** Administrators only; a customer's own Customer is always enforced instead. */
  customerId?: string;
}

export type PropertyHistoryAudience = 'customer' | 'administrator';

export interface HistoryStop {
  id: string;
  routeId: string;
  customerId?: string | null;
  propertyKey?: string | null;
  address?: string | null;
  agent?: string | null;
  isAuction?: boolean | null;
  numberOfSigns?: number | null;
  notes?: string | null;
  missingSignsCount?: number | null;
  locationPrecision?: string | null;
}

export interface HistoryRoute {
  id: string;
  routeCode?: string | null;
  scheduledDate?: string | null;
  actualStartTime?: string | null;
  placementStartTime?: string | null;
  status?: RouteStatus | null;
  customerId?: string | null;
  assignedOperatorName?: string | null;
}

export interface HistoryInvoice {
  id: string;
  invoiceNumber: string;
  routeId?: string | null;
  status?: 'draft' | 'sent' | 'paid' | null;
}

export interface InvoiceLink {
  id: string;
  invoiceNumber: string;
}

export interface VisitRow {
  stopId: string;
  routeId: string;
  date: string | null;
  routeCode: string | null;
  agent: string | null;
  auction: boolean;
  signsPlaced: number;
  /** Empty means "Not yet invoiced". */
  invoices: InvoiceLink[];
  status: RouteStatus | 'skipped';
  // Administrator-only:
  customerName?: string | null;
  operatorName?: string | null;
  missingSigns?: number;
  locationPrecision?: string | null;
}

export interface PropertyGroup {
  propertyKey: string;
  address: string;
  visitCount: number;
  /** Visits (counted) and Skipped Stops, newest first. */
  visits: VisitRow[];
  /** Planned and in-progress Routes, soonest first. Never counted. */
  scheduled: VisitRow[];
}

export interface StreetGroup {
  street: string;
  properties: PropertyGroup[];
}

export type PropertyHistoryResult =
  | { level: 'suburb'; streets: StreetGroup[] }
  | { level: 'street'; properties: PropertyGroup[] }
  | { level: 'address'; property: PropertyGroup | null };

const VISIT_STATUSES: readonly RouteStatus[] = ['signs_placed', 'signs_picked_up', 'completed', 'archived'];
const CUSTOMER_INVOICE_STATUSES = ['sent', 'paid'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseSearch(raw: unknown): PropertyHistorySearch | null {
  if (!raw || typeof raw !== 'object') return null;
  const search = raw as Record<string, unknown>;
  const suburb = text(search.suburb);
  const postcode = typeof search.postcode === 'string' ? search.postcode.trim() : undefined;
  switch (search.level) {
    case 'suburb':
      return suburb ? { level: 'suburb', suburb, ...(postcode !== undefined ? { postcode } : {}) } : null;
    case 'street': {
      const street = text(search.street);
      return suburb && street && postcode !== undefined ? { level: 'street', suburb, postcode, street } : null;
    }
    case 'address': {
      const propertyKey = text(search.propertyKey);
      return propertyKey && parsePropertyKey(propertyKey) ? { level: 'address', propertyKey } : null;
    }
    default:
      return null;
  }
}

function parseFilters(raw: unknown): PropertyHistoryFilters | null {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object') return null;
  const input = raw as Record<string, unknown>;
  const filters: PropertyHistoryFilters = {};
  for (const field of ['dateFrom', 'dateTo'] as const) {
    if (input[field] === undefined || input[field] === '') continue;
    if (typeof input[field] !== 'string' || !DATE.test(input[field] as string)) return null;
    filters[field] = input[field] as string;
  }
  if (input.auction !== undefined && input.auction !== null) {
    if (typeof input.auction !== 'boolean') return null;
    filters.auction = input.auction;
  }
  const agent = text(input.agent);
  if (agent) filters.agent = agent;
  const customerId = text(input.customerId);
  if (customerId) filters.customerId = customerId;
  return filters;
}

/** The search and filters from a request body, or null if they're malformed. */
export function parsePropertyHistoryRequest(body: unknown): { search: PropertyHistorySearch; filters: PropertyHistoryFilters } | null {
  if (!body || typeof body !== 'object') return null;
  const { search: rawSearch, filters: rawFilters } = body as Record<string, unknown>;
  const search = parseSearch(rawSearch);
  const filters = parseFilters(rawFilters);
  return search && filters ? { search, filters } : null;
}

/** The propertyKey key condition for the Stop indexes: a delimited prefix, so "Epping" never matches "North Epping". */
export function propertyKeyCondition(search: PropertyHistorySearch): { beginsWith: string } | { eq: string } {
  switch (search.level) {
    case 'address':
      return { eq: search.propertyKey };
    case 'street':
      return { beginsWith: propertyKeyPrefix(search) };
    case 'suburb':
      return {
        beginsWith: propertyKeyPrefix(search.postcode !== undefined ? { suburb: search.suburb, postcode: search.postcode } : { suburb: search.suburb }),
      };
  }
}

/**
 * Each Route's Invoices: linked by Invoice.routeId or by a LineItem for the
 * route, ordered by number. Customers only ever see sent or paid Invoices.
 */
export function resolveRouteInvoices(
  invoices: readonly HistoryInvoice[],
  lineItems: readonly { invoiceId?: string | null; routeId?: string | null }[],
  audience: PropertyHistoryAudience
): Map<string, InvoiceLink[]> {
  const visible = new Map(
    invoices
      .filter((invoice) => audience === 'administrator' || CUSTOMER_INVOICE_STATUSES.includes(invoice.status ?? ''))
      .map((invoice) => [invoice.id, invoice])
  );
  const links = [
    ...invoices.map((invoice) => ({ routeId: invoice.routeId, invoiceId: invoice.id })),
    ...lineItems.map((item) => ({ routeId: item.routeId, invoiceId: item.invoiceId })),
  ];

  const byRoute = new Map<string, Map<string, InvoiceLink>>();
  for (const { routeId, invoiceId } of links) {
    const invoice = invoiceId ? visible.get(invoiceId) : undefined;
    if (!routeId || !invoice) continue;
    const routeInvoices = byRoute.get(routeId) ?? new Map<string, InvoiceLink>();
    routeInvoices.set(invoice.id, { id: invoice.id, invoiceNumber: invoice.invoiceNumber });
    byRoute.set(routeId, routeInvoices);
  }
  return new Map(
    [...byRoute].map(([routeId, routeInvoices]) => [
      routeId,
      [...routeInvoices.values()].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber, undefined, { numeric: true })),
    ])
  );
}

/** A Visit table's columns, as screens and reports show them; staff also get STAFF_VISIT_COLUMNS. */
export const VISIT_COLUMNS = ['Date', 'Route', 'Agent', 'Auction', 'Signs Placed', 'Invoice(s)', 'Status'] as const;
export const STAFF_VISIT_COLUMNS = ['Customer', 'Operator', 'Missing Signs', 'Location'] as const;

export const VISIT_STATUS_LABELS: Record<VisitRow['status'], string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  signs_placed: 'Signs placed',
  signs_picked_up: 'Signs picked up',
  completed: 'Completed',
  archived: 'Archived',
  skipped: 'Skipped',
};

/** A row's Invoice(s) as screens and reports show them. */
export function invoiceLabel(invoices: readonly InvoiceLink[]): string {
  return invoices.length > 0 ? invoices.map((invoice) => invoice.invoiceNumber).join(', ') : 'Not yet invoiced';
}

/**
 * A Visit's date is the day its Route ran, which imported Routes only record
 * in their start times (#388). Every date on Property History -- shown,
 * sorted, filtered and picking a Property's latest address -- is this one.
 */
const visitDate = (route: HistoryRoute) => getRouteRunDate(route);

function matchesFilters(stop: HistoryStop, route: HistoryRoute, filters: PropertyHistoryFilters): boolean {
  const date = visitDate(route) ?? '';
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  if (filters.agent && stop.agent?.trim().toLowerCase() !== filters.agent.trim().toLowerCase()) return false;
  if (filters.auction !== undefined && Boolean(stop.isAuction) !== filters.auction) return false;
  if (filters.customerId && stop.customerId !== filters.customerId) return false;
  return true;
}

function toRow(
  stop: HistoryStop,
  route: HistoryRoute,
  status: VisitRow['status'],
  input: Pick<BuildInput, 'invoicesByRouteId' | 'customerNamesById' | 'audience'>
): VisitRow {
  const row: VisitRow = {
    stopId: stop.id,
    routeId: route.id,
    date: visitDate(route),
    routeCode: route.routeCode ?? null,
    agent: stop.agent ?? null,
    auction: Boolean(stop.isAuction),
    signsPlaced: stop.numberOfSigns ?? 0,
    invoices: input.invoicesByRouteId.get(route.id) ?? [],
    status,
  };
  if (input.audience !== 'administrator') return row;
  return {
    ...row,
    customerName: (stop.customerId && input.customerNamesById[stop.customerId]) || null,
    operatorName: route.assignedOperatorName ?? null,
    missingSigns: stop.missingSignsCount ?? 0,
    locationPrecision: stop.locationPrecision ?? null,
  };
}

/** Dated rows in date order, then undated ones by Route Code; `newest` reverses both. */
function visitOrder(newest: boolean) {
  const direction = newest ? -1 : 1;
  return (a: VisitRow, b: VisitRow) => {
    if (!a.date !== !b.date) return a.date ? -1 : 1;
    const key = (row: VisitRow) => (row.date ? row.date : (row.routeCode ?? ''));
    return direction * key(a).localeCompare(key(b));
  };
}
const byKey = (a: { propertyKey: string }, b: { propertyKey: string }) => comparePropertyKeys(a.propertyKey, b.propertyKey);

interface BuildInput {
  search: PropertyHistorySearch;
  filters: PropertyHistoryFilters;
  /** Already scoped by the caller: a customer's own Customer's Stops only. */
  stops: readonly HistoryStop[];
  routesById: Readonly<Record<string, HistoryRoute>>;
  invoicesByRouteId: ReadonlyMap<string, InvoiceLink[]>;
  customerNamesById: Readonly<Record<string, string>>;
  audience: PropertyHistoryAudience;
}

export function buildPropertyHistory(input: BuildInput): PropertyHistoryResult {
  const groups = new Map<string, { group: PropertyGroup; latest: { date: string; address: string } }>();

  for (const stop of input.stops) {
    const route = input.routesById[stop.routeId];
    if (!stop.propertyKey || !route || !matchesFilters(stop, route, input.filters)) continue;

    const entry = groups.get(stop.propertyKey) ?? {
      group: { propertyKey: stop.propertyKey, address: '', visitCount: 0, visits: [], scheduled: [] },
      latest: { date: '', address: '' },
    };
    groups.set(stop.propertyKey, entry);

    const date = visitDate(route) ?? '';
    if (stop.address && (!entry.latest.address || date >= entry.latest.date)) entry.latest = { date, address: stop.address };

    if (!VISIT_STATUSES.includes(route.status as RouteStatus)) {
      entry.group.scheduled.push(toRow(stop, route, route.status ?? 'planned', input));
    } else if (stopProgress(stop).placement.state === 'skipped') {
      entry.group.visits.push(toRow(stop, route, 'skipped', input));
    } else {
      entry.group.visits.push(toRow(stop, route, route.status as RouteStatus, input));
      entry.group.visitCount += 1;
    }
  }

  const properties = [...groups.values()]
    .map(({ group, latest }) => ({
      ...group,
      address: latest.address || propertyKeyLabel(group.propertyKey),
      visits: group.visits.sort(visitOrder(true)),
      scheduled: group.scheduled.sort(visitOrder(false)),
    }))
    .sort(byKey);

  switch (input.search.level) {
    case 'address':
      return { level: 'address', property: properties[0] ?? null };
    case 'street':
      return { level: 'street', properties };
    case 'suburb': {
      // A street is its suburb|postcode|street, so a suburb search without a
      // postcode keeps same-named streets in two same-named suburbs apart.
      const streets = new Map<string, StreetGroup>();
      for (const property of properties) {
        const streetKey = streetKeyOf(property.propertyKey);
        const group = streets.get(streetKey) ?? { street: parsePropertyKey(property.propertyKey)?.street ?? '', properties: [] };
        group.properties.push(property);
        streets.set(streetKey, group);
      }
      return { level: 'suburb', streets: [...streets.values()] };
    }
  }
}
