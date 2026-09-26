import type { Route, Stop } from '@/amplify/types';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Formats a timestamp, or a date-only value such as a route date. A date-only
 * value is a calendar day, so it's shown in UTC -- in the viewer's timezone
 * '2024-01-15' (midnight UTC) would show as Jan 14 anywhere west of UTC.
 */
export function formatRouteDate(dateString?: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(DATE_ONLY.test(dateString) ? { timeZone: 'UTC' } : {}),
  });
}

/**
 * The route's date as customers know it (YYYY-MM-DD): its scheduledDate, else
 * the UTC day it started, else the UTC day it was created. Routes imported in
 * bulk have no scheduledDate and a createdAt of the import, so their run date
 * only survives in actualStartTime (#314).
 */
export function getRouteDate(route: {
  scheduledDate?: string | null;
  actualStartTime?: string | null;
  createdAt?: string | null;
}): string | null {
  if (route.scheduledDate) return route.scheduledDate;
  const timestamp = route.actualStartTime || route.createdAt;
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function formatRouteDateTime(dateString?: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatElapsedMinutes(minutes: number | null) {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

export function formatCurrency(amount: number | null) {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getRouteDurationMinutes(route: Route) {
  if (typeof route.overrideDurationMinutes === 'number') {
    return Math.max(0, route.overrideDurationMinutes);
  }

  if (typeof route.actualDurationMinutes === 'number') {
    return Math.max(0, route.actualDurationMinutes);
  }

  if (route.placementStartTime && route.pickupEndTime) {
    return Math.max(
      0,
      Math.round((new Date(route.pickupEndTime).getTime() - new Date(route.placementStartTime).getTime()) / 60000)
    );
  }

  if (route.actualStartTime && route.actualEndTime) {
    return Math.max(
      0,
      Math.round((new Date(route.actualEndTime).getTime() - new Date(route.actualStartTime).getTime()) / 60000)
    );
  }

  if (route.status === 'in_progress') {
    const phaseStart =
      route.executionPhase === 'pickup'
        ? route.pickupStartTime ?? route.actualStartTime
        : route.placementStartTime ?? route.actualStartTime;
    if (phaseStart) {
      return Math.max(1, Math.round((Date.now() - new Date(phaseStart).getTime()) / 60000));
    }
  }

  return null;
}

export function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function getPrimaryAddressLine(address?: string | null) {
  if (!address) return '';
  const firstSegment = address.split(',')[0]?.trim();
  return firstSegment || address;
}

export function getSecondaryAddressLine(address?: string | null) {
  if (!address) return '';
  const [, ...rest] = address.split(',');
  return rest.join(',').trim();
}

export function calculateRouteDistanceKm(stops: Stop[]) {
  const orderedCoordinates = [...stops]
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))
    .filter(
      (stop) => typeof stop.latitude === 'number' && typeof stop.longitude === 'number'
    )
    .map((stop) => ({ lat: stop.latitude as number, lng: stop.longitude as number }));

  if (orderedCoordinates.length < 2) {
    return 0;
  }

  let total = 0;
  for (let i = 1; i < orderedCoordinates.length; i += 1) {
    total += haversineDistanceKm(orderedCoordinates[i - 1], orderedCoordinates[i]);
  }

  return Number(total.toFixed(2));
}