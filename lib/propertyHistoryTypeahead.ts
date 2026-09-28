/**
 * The Property History typeahead (#289): every suburb, street and Property the
 * caller's Stops cover, each carrying the exact search it stands for. Searches
 * are only ever run from one of these, so "Epping" never matches "North
 * Epping". Built from Stops the caller can already read -- every Stop for an
 * administrator, their own Customer's for a customer user.
 */
import type { PropertyHistorySearch } from '@/lib/propertyHistory';
import { parsePropertyKey, propertyKeyLabel, streetLabel, suburbLabel } from '@/lib/propertyKey';

export interface TypeaheadOption {
  key: string;
  label: string;
  search: PropertyHistorySearch;
}

interface TypeaheadStop {
  propertyKey?: string | null;
  address?: string | null;
}

const LEVEL_ORDER: Record<PropertyHistorySearch['level'], number> = { suburb: 0, street: 1, address: 2 };

export function buildTypeaheadOptions(stops: readonly TypeaheadStop[]): TypeaheadOption[] {
  const options = new Map<string, TypeaheadOption>();

  for (const stop of stops) {
    const parts = stop.propertyKey ? parsePropertyKey(stop.propertyKey) : null;
    if (!stop.propertyKey || !parts) continue;
    const { suburb, postcode, street } = parts;

    const suburbKey = `suburb:${suburb}|${postcode}`;
    if (!options.has(suburbKey)) {
      options.set(suburbKey, { key: suburbKey, label: suburbLabel(suburb, postcode), search: { level: 'suburb', suburb, postcode } });
    }
    const streetKey = `street:${suburb}|${postcode}|${street}`;
    if (!options.has(streetKey)) {
      options.set(streetKey, {
        key: streetKey,
        label: streetLabel(parts),
        search: { level: 'street', suburb, postcode, street },
      });
    }
    // The label follows the latest Stop listed at the Property.
    const addressKey = `address:${stop.propertyKey}`;
    options.set(addressKey, {
      key: addressKey,
      label: stop.address || options.get(addressKey)?.label || propertyKeyLabel(stop.propertyKey),
      search: { level: 'address', propertyKey: stop.propertyKey },
    });
  }

  return [...options.values()].sort(
    (a, b) => LEVEL_ORDER[a.search.level] - LEVEL_ORDER[b.search.level] || a.key.localeCompare(b.key, undefined, { numeric: true })
  );
}

/** Options whose label contains every word of the query, suburbs first. */
export function matchTypeaheadOptions(options: readonly TypeaheadOption[], query: string, limit = 12): TypeaheadOption[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.join(' ').length < 2) return [];
  return options.filter((option) => words.every((word) => option.label.toLowerCase().includes(word))).slice(0, limit);
}
