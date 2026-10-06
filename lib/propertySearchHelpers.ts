/**
 * Pure matching/grouping logic behind the administrator Routes "Find a
 * property" card — search every stop's address across all routes.
 *
 * Stop only has a free-text `address` (e.g. "14 Cliff Rd, Epping NSW 2121"),
 * not structured street/suburb fields, so the street/suburb scopes are
 * approximated by splitting the address on its first comma.
 */
import type { Route, Stop } from '@/amplify/types';

export type PropertyMatchScope = 'Anything' | 'Full address' | 'Street' | 'Suburb';

export const PROPERTY_MATCH_SCOPES: PropertyMatchScope[] = ['Anything', 'Full address', 'Street', 'Suburb'];

export type PropertyMatchLabel = 'address match' | 'street match' | 'suburb match';

export interface PropertyRouteMatch {
  routeId: string;
  routeCode: string;
  scheduledDate?: string | null;
  route: Route;
}

export interface PropertyMatch {
  key: string;
  address: string;
  signs: number;
  agent: string;
  customerName: string;
  matchLabel: PropertyMatchLabel;
  routes: PropertyRouteMatch[];
}

export function normalizeAddress(value: string) {
  return value
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitAddress(address: string) {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    streetPart: parts[0] || address,
    suburbPart: parts.slice(1).join(', '),
  };
}

function matchLabelFor(address: string, scope: PropertyMatchScope, needle: string): PropertyMatchLabel | null {
  const full = normalizeAddress(address);
  const { streetPart, suburbPart } = splitAddress(address);
  const street = normalizeAddress(streetPart);
  const suburb = normalizeAddress(suburbPart);

  if (scope === 'Suburb') return suburb.includes(needle) ? 'suburb match' : null;
  if (scope === 'Street') return street.includes(needle) ? 'street match' : null;
  if (scope === 'Full address') return full.includes(needle) ? 'address match' : null;

  if (suburb.includes(needle)) return 'suburb match';
  if (street.includes(needle)) return 'street match';
  if (full.includes(needle)) return 'address match';
  return null;
}

/** Distinct normalized addresses across every stop — feeds the idle-state note. */
export function countDistinctProperties(stops: Stop[]) {
  const keys = new Set<string>();
  for (const stop of stops) {
    const address = stop.address || stop.formattedAddress;
    if (address) keys.add(normalizeAddress(address));
  }
  return keys.size;
}

export function buildPropertyMatches(
  stops: Stop[],
  routesById: Record<string, Route>,
  customersById: Record<string, string>,
  query: string,
  scope: PropertyMatchScope
): PropertyMatch[] {
  const needle = normalizeAddress(query);
  if (needle.length < 2) return [];

  const byKey = new Map<string, PropertyMatch>();

  for (const stop of stops) {
    const address = stop.address || stop.formattedAddress;
    if (!address) continue;

    const route = routesById[stop.routeId];
    if (!route) continue;

    const matchLabel = matchLabelFor(address, scope, needle);
    if (!matchLabel) continue;

    const key = normalizeAddress(address);
    const routeEntry: PropertyRouteMatch = {
      routeId: route.id,
      routeCode: route.routeCode || route.id.slice(0, 8),
      scheduledDate: route.scheduledDate,
      route,
    };

    const existing = byKey.get(key);
    if (existing) {
      if (!existing.routes.some((r) => r.routeId === route.id)) {
        existing.routes.push(routeEntry);
      }
      continue;
    }

    byKey.set(key, {
      key,
      address,
      signs: stop.numberOfSigns || 0,
      agent: stop.agent || '—',
      customerName: (stop.customerId && customersById[stop.customerId]) || '—',
      matchLabel,
      routes: [routeEntry],
    });
  }

  return Array.from(byKey.values()).sort((a, b) => a.address.localeCompare(b.address));
}
