/**
 * Property History as the browser uses it (#289, #291): the typeahead's
 * options, the search itself (always through /api/property-history/search, so
 * screens and reports agree), the other Properties on a Route, and reports --
 * which the server generates from just the search and filters (ADR 0003).
 */
import { callApi } from '@/lib/apiClient';
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';
import type { PropertyHistoryFilters, PropertyHistoryResult, PropertyHistorySearch } from '@/lib/propertyHistory';
import type { PropertyHistoryReportSummary } from '@/lib/propertyHistoryReport';
import { buildTypeaheadOptions, type TypeaheadOption } from '@/lib/propertyHistoryTypeahead';

export interface RouteProperty {
  propertyKey: string;
  address: string;
}

/** Every suburb, street and Property the signed-in user's readable Stops cover. */
export async function listTypeaheadOptions(): Promise<{ data: TypeaheadOption[]; error?: string }> {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Stop', { selectionSet: ['propertyKey', 'address'] });
    if (errors.length > 0) {
      console.error('Errors loading Property History search options:', errors);
      return { data: buildTypeaheadOptions(data), error: 'Some addresses could not be loaded, so the suggestions may be incomplete.' };
    }
    return { data: buildTypeaheadOptions(data) };
  } catch (error) {
    console.error('Error loading Property History search options:', error);
    return { data: [], error: 'Could not load addresses to search.' };
  }
}

export function searchPropertyHistory(search: PropertyHistorySearch, filters: PropertyHistoryFilters): Promise<PropertyHistoryResult> {
  return callApi<PropertyHistoryResult>('/api/property-history/search', { search, filters });
}

/** The Properties a Route visits, in Stop order, each once. Throws if the Stops can't be read. */
export async function listRouteProperties(routeId: string): Promise<RouteProperty[]> {
  const { data, errors } = await listAll(getDataClient(), 'Stop', {
    filter: { routeId: { eq: routeId } },
    selectionSet: ['propertyKey', 'address', 'sequence'],
  });
  if (errors.length > 0) throw new Error('Could not load the Route’s Stops.');
  const properties = new Map<string, RouteProperty>();
  for (const stop of [...data].sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))) {
    if (stop.propertyKey && !properties.has(stop.propertyKey)) {
      properties.set(stop.propertyKey, { propertyKey: stop.propertyKey, address: stop.address });
    }
  }
  return [...properties.values()];
}

/** Generates a report of the search; resolves to it and a short-lived link to its PDF. */
export function generatePropertyHistoryReport(
  search: PropertyHistorySearch,
  filters: PropertyHistoryFilters
): Promise<{ report: PropertyHistoryReportSummary; url: string }> {
  return callApi('/api/property-history/reports', { search, filters });
}

export async function listPropertyHistoryReports(): Promise<PropertyHistoryReportSummary[]> {
  return (await callApi<{ reports: PropertyHistoryReportSummary[] }>('/api/property-history/reports/list', {})).reports;
}

/** A short-lived link to a report's PDF. */
export async function openPropertyHistoryReport(reportId: string): Promise<string> {
  return (await callApi<{ url: string }>('/api/property-history/reports/open', { reportId })).url;
}

/** An Account Owner's delete: the report leaves every customer's list, but administrators can restore it. */
export async function deletePropertyHistoryReport(reportId: string): Promise<PropertyHistoryReportSummary> {
  return (await callApi<{ report: PropertyHistoryReportSummary }>('/api/property-history/reports/delete', { reportId })).report;
}

/** An administrator restores a deleted report for a fresh 30 days. */
export async function restorePropertyHistoryReport(reportId: string): Promise<PropertyHistoryReportSummary> {
  return (await callApi<{ report: PropertyHistoryReportSummary }>('/api/property-history/reports/restore', { reportId })).report;
}
