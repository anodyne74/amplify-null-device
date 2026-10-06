import { buildPropertyMatches, countDistinctProperties, normalizeAddress } from './propertySearchHelpers';
import type { Route, Stop } from '@/amplify/types';

const routeA: Route = { id: 'route-a', routeCode: 'W26-08-127', customerId: 'cust-1', scheduledDate: '2026-08-29' };
const routeB: Route = { id: 'route-b', routeCode: 'W26-08-124', customerId: 'cust-1', scheduledDate: '2026-08-22' };
const routesById: Record<string, Route> = { 'route-a': routeA, 'route-b': routeB };
const customersById: Record<string, string> = { 'cust-1': 'Harcourts Epping' };

const stops: Stop[] = [
  {
    id: 'stop-1',
    routeId: 'route-a',
    customerId: 'cust-1',
    address: '14 Cliff Rd, Epping NSW 2121',
    agent: "Betty O'Shea",
    numberOfSigns: 3,
  },
  {
    id: 'stop-2',
    routeId: 'route-b',
    customerId: 'cust-1',
    address: '14 Cliff Rd, Epping NSW 2121',
    agent: "Betty O'Shea",
    numberOfSigns: 3,
  },
  {
    id: 'stop-3',
    routeId: 'route-a',
    customerId: 'cust-1',
    address: '19 Ryedale Rd, Eastwood NSW 2122',
    agent: 'Sam Whitton',
    numberOfSigns: 4,
  },
];

describe('normalizeAddress', () => {
  it('lowercases, strips commas, and collapses whitespace', () => {
    expect(normalizeAddress('14 Cliff Rd,  Epping   NSW 2121')).toBe('14 cliff rd epping nsw 2121');
  });
});

describe('countDistinctProperties', () => {
  it('counts distinct normalized addresses, not stop rows', () => {
    expect(countDistinctProperties(stops)).toBe(2);
  });

  it('ignores stops with no address', () => {
    expect(countDistinctProperties([{ id: 's', routeId: 'r' } as Stop])).toBe(0);
  });
});

describe('buildPropertyMatches', () => {
  it('returns nothing below the two-character idle threshold', () => {
    expect(buildPropertyMatches(stops, routesById, customersById, 'c', 'Anything')).toEqual([]);
    expect(buildPropertyMatches(stops, routesById, customersById, '', 'Anything')).toEqual([]);
  });

  it('groups repeat addresses across routes into one property', () => {
    const matches = buildPropertyMatches(stops, routesById, customersById, 'cliff', 'Anything');
    expect(matches).toHaveLength(1);
    expect(matches[0].address).toBe('14 Cliff Rd, Epping NSW 2121');
    expect(matches[0].routes.map((r) => r.routeCode).sort()).toEqual(['W26-08-124', 'W26-08-127']);
  });

  it('matches on suburb under Anything scope', () => {
    const matches = buildPropertyMatches(stops, routesById, customersById, 'eastwood', 'Anything');
    expect(matches).toHaveLength(1);
    expect(matches[0].matchLabel).toBe('suburb match');
  });

  it('restricts to street matches when scope is Street', () => {
    // "Epping" only appears in the suburb segment, so it should not match under Street scope.
    expect(buildPropertyMatches(stops, routesById, customersById, 'epping', 'Street')).toEqual([]);
    const streetMatches = buildPropertyMatches(stops, routesById, customersById, 'cliff', 'Street');
    expect(streetMatches).toHaveLength(1);
    expect(streetMatches[0].matchLabel).toBe('street match');
  });

  it('restricts to suburb matches when scope is Suburb', () => {
    expect(buildPropertyMatches(stops, routesById, customersById, 'cliff', 'Suburb')).toEqual([]);
  });

  it('restricts to full-address matches when scope is Full address', () => {
    const matches = buildPropertyMatches(stops, routesById, customersById, '14 cliff rd', 'Full address');
    expect(matches).toHaveLength(1);
    expect(matches[0].matchLabel).toBe('address match');
  });

  it('carries signs, agent, and customer name onto the match', () => {
    const matches = buildPropertyMatches(stops, routesById, customersById, 'ryedale', 'Anything');
    expect(matches[0]).toMatchObject({ signs: 4, agent: 'Sam Whitton', customerName: 'Harcourts Epping' });
  });

  it('skips stops whose route is missing from routesById', () => {
    const orphanStop: Stop = { id: 'orphan', routeId: 'route-z', address: '1 Ghost St, Nowhere NSW 0000' };
    expect(buildPropertyMatches([orphanStop], routesById, customersById, 'ghost', 'Anything')).toEqual([]);
  });

  it('returns no matches when nothing matches the query', () => {
    expect(buildPropertyMatches(stops, routesById, customersById, 'nonexistent', 'Anything')).toEqual([]);
  });
});
