import { getFinalizedRouteDistanceKm, getFinalizedRouteMinutes } from './routeInvoiceMetrics';
import type { Route } from '@/amplify/types';

describe('getFinalizedRouteMinutes', () => {
  it('returns 0 when there is no route', () => {
    expect(getFinalizedRouteMinutes(undefined)).toBe(0);
    expect(getFinalizedRouteMinutes(null)).toBe(0);
  });

  it('prefers overrideDurationMinutes over actualDurationMinutes', () => {
    const route = { overrideDurationMinutes: 120, actualDurationMinutes: 90 } as Route;
    expect(getFinalizedRouteMinutes(route)).toBe(120);
  });

  it('falls back to actualDurationMinutes when there is no override', () => {
    const route = { actualDurationMinutes: 90 } as Route;
    expect(getFinalizedRouteMinutes(route)).toBe(90);
  });

  it('falls back to 0 when neither field is set', () => {
    const route = {} as Route;
    expect(getFinalizedRouteMinutes(route)).toBe(0);
  });
});

describe('getFinalizedRouteDistanceKm', () => {
  it('returns 0 when there is no route', () => {
    expect(getFinalizedRouteDistanceKm(undefined)).toBe(0);
    expect(getFinalizedRouteDistanceKm(null)).toBe(0);
  });

  it('prefers overrideDistanceKm over the measured segments', () => {
    const route = {
      overrideDistanceKm: 42,
      signsPlacedDistanceKm: 10,
      signsPickedUpDistanceKm: 10,
    } as Route;
    expect(getFinalizedRouteDistanceKm(route)).toBe(42);
  });

  it('sums the measured placement/pickup segments when there is no override', () => {
    const route = { signsPlacedDistanceKm: 12.5, signsPickedUpDistanceKm: 8.25 } as Route;
    expect(getFinalizedRouteDistanceKm(route)).toBe(20.75);
  });

  it('treats missing measured segments as 0', () => {
    const route = { signsPlacedDistanceKm: 12.5 } as Route;
    expect(getFinalizedRouteDistanceKm(route)).toBe(12.5);
  });
});
