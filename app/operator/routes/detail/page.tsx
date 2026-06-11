'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { StopForm } from '@/app/operator/components/StopForm';
import { isAdmin } from '@/lib/amplify-config';
import { generateAgentInitials, getAgentBadgeTone } from '@/lib/customerDefaults';
import { geocodeAddress } from '@/lib/googleMaps';
import {
  calculateRouteDistanceKm,
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  formatRouteDateTime,
  getRouteDurationMinutes,
} from '@/lib/routeDetailHelpers';
import { getRouteStatusPresentation } from '@/lib/routeStatusHelpers';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import {
  createStop,
  deleteRoute,
  getCustomer,
  getUserSettings,
  updateRoute,
  updateRouteExecution,
  updateStopExecution,
} from '@/lib/queries';
import type { MapTheme } from '@/lib/mapThemes';
import { MAP_THEMES } from '@/lib/mapThemes';
import { deleteStop } from '@/lib/queries/DeleteStop';
import { updateStop } from '@/lib/queries/UpdateStop';
import type { Route, Stop } from '@/amplify/types';
import styles from './page.module.css';

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

function StatusBadge({ status }: { status?: string | null }) {
  const presentation = getRouteStatusPresentation(status);
  const badgeClass = {
    planned: styles.badgePlanned,
    active: styles.badgeActive,
    completed: styles.badgeCompleted,
    archived: styles.badgeArchived,
  }[presentation.badgeKey] ?? styles.badgePlanned;

  return (
    <span className={`${styles.badge} ${badgeClass}`}>
      {presentation.label}
    </span>
  );
}

function getAgentBadgeInitials(agentName: string) {
  const compact = agentName.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const generated = (generateAgentInitials(agentName) ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  if (generated.length >= 2) return generated.slice(0, 2);
  if (generated.length === 1 && compact.length >= 2) return `${generated}${compact[1]}`;
  if (compact.length >= 2) return compact.slice(0, 2);
  if (compact.length === 1) return `${compact}G`;
  return 'AG';
}

function getPhaseDurationMinutes(route: Route, phase: ExecutionPhase) {
  const phaseStart =
    phase === 'pickup'
      ? route.pickupStartTime
      : route.placementStartTime ?? route.actualStartTime;

  const phaseEnd =
    phase === 'pickup'
      ? route.pickupEndTime
      : route.placementEndTime;

  if (phaseStart && phaseEnd) {
    return Math.max(0, Math.round((new Date(phaseEnd).getTime() - new Date(phaseStart).getTime()) / 60000));
  }

  if (route.status === 'in_progress' && route.executionPhase === phase && phaseStart) {
    return Math.max(1, Math.round((Date.now() - new Date(phaseStart).getTime()) / 60000));
  }

  return 0;
}

function parseNonNegativeInt(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function roundToNearestFive(minutes: number) {
  return Math.max(0, Math.round(minutes / 5) * 5);
}

function haversineDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

type ExecutionPhase = 'placement' | 'pickup';

const PLACEMENT_DONE_MARKER = 'PLACEMENT_DONE';
const PICKUP_DONE_MARKER = 'PICKUP_DONE';
const PLACEMENT_SKIPPED_MARKER = 'PLACEMENT_SKIPPED';
const PICKUP_SKIPPED_MARKER = 'PICKUP_SKIPPED';

function removeMarker(notes: string, marker: string) {
  return notes.replace(new RegExp(`(?:^|\\s)\\[${marker}:[^\\]]*\\]`, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

function upsertMarker(notes: string | null | undefined, marker: string, atIso: string) {
  const base = removeMarker(notes ?? '', marker);
  return `${base}${base ? ' ' : ''}[${marker}:${atIso}]`;
}

function getMarkerTimestamp(notes: string | null | undefined, marker: string) {
  if (!notes) return null;
  const match = notes.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`));
  return match?.[1] ?? null;
}

function isStopSkippedForPhase(stop: Stop, phase: ExecutionPhase) {
  if (phase === 'placement') {
    return Boolean(getMarkerTimestamp(stop.notes, PLACEMENT_SKIPPED_MARKER));
  }
  return Boolean(getMarkerTimestamp(stop.notes, PICKUP_SKIPPED_MARKER));
}

function isStopCompletedForPhase(stop: Stop, phase: ExecutionPhase) {
  if (phase === 'placement') {
    return (
      Boolean(getMarkerTimestamp(stop.notes, PLACEMENT_DONE_MARKER)) ||
      Boolean(getMarkerTimestamp(stop.notes, PLACEMENT_SKIPPED_MARKER)) ||
      (stop.serviceType !== 'pickup' && Boolean(stop.actualDepartureTime))
    );
  }

  return (
    Boolean(getMarkerTimestamp(stop.notes, PICKUP_DONE_MARKER)) ||
    Boolean(getMarkerTimestamp(stop.notes, PICKUP_SKIPPED_MARKER)) ||
    (stop.serviceType === 'pickup' && Boolean(stop.actualDepartureTime))
  );
}

function getPhaseCompletionTime(stop: Stop, phase: ExecutionPhase) {
  if (phase === 'placement') {
    return (
      getMarkerTimestamp(stop.notes, PLACEMENT_DONE_MARKER) ||
      getMarkerTimestamp(stop.notes, PLACEMENT_SKIPPED_MARKER)
    );
  }

  return (
    getMarkerTimestamp(stop.notes, PICKUP_DONE_MARKER) ||
    getMarkerTimestamp(stop.notes, PICKUP_SKIPPED_MARKER)
  );
}

function isStopCompleted(stop: Stop) {
  return Boolean(stop.actualDepartureTime);
}

function getStopStatusLabel(stop: Stop, executionPhase?: ExecutionPhase | null) {
  if (executionPhase) {
    if (isStopSkippedForPhase(stop, executionPhase)) {
      return executionPhase === 'pickup' ? 'Pickup skipped' : 'Placement skipped';
    }
    if (isStopCompletedForPhase(stop, executionPhase)) {
      return executionPhase === 'pickup' ? 'Signs collected' : 'Signs placed';
    }
    return executionPhase === 'pickup' ? 'Awaiting pickup' : 'Awaiting placement';
  }

  if (stop.notes?.startsWith('[SKIPPED]')) return 'Signs skipped';
  if (stop.actualDepartureTime) {
    return stop.serviceType === 'pickup' ? 'Signs collected' : 'Signs placed';
  }
  if (stop.actualArrivalTime) return 'At stop';
  return 'Signs pending';
}

function getPrimaryAddressLine(address?: string | null) {
  if (!address) return '';
  const firstSegment = address.split(',')[0]?.trim();
  return firstSegment || address;
}

function isPlacementPhase(status?: string | null, executionPhase?: string | null) {
  return status === 'in_progress' && executionPhase === 'placement';
}

function isPickupPhase(status?: string | null, executionPhase?: string | null) {
  return status === 'in_progress' && executionPhase === 'pickup';
}

function RouteDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const { user } = useAuthenticator();
  const canManagePlanning = isAdmin(user);

  const [route, setRoute] = useState<Route | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerRatePerHour, setCustomerRatePerHour] = useState<number | null>(null);
  const [customerAddressOrigin, setCustomerAddressOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [customerDefaults, setCustomerDefaults] = useState<{
    standingInstructions?: string | null;
    defaultNumberOfSigns?: number | null;
    defaultAgentName?: string | null;
    agentOptions?: string[] | null;
  } | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddStop, setShowAddStop] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState<string | null>(null);

  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editingStop, setEditingStop] = useState(false);
  const [editStopError, setEditStopError] = useState<string | null>(null);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [pendingDeleteStopId, setPendingDeleteStopId] = useState<string | null>(null);
  const [deletingStopId, setDeletingStopId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const [transitioning, setTransitioning] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [phaseMetricOverrides, setPhaseMetricOverrides] = useState({
    placementDistanceKm: '0.00',
    placementDurationMinutes: '0',
    pickupDistanceKm: '0.00',
    pickupDurationMinutes: '0',
  });

  const updatePhaseDurationFromSpinner = useCallback(
    (field: 'placementDurationMinutes' | 'pickupDurationMinutes', unit: 'hours' | 'minutes', rawValue: string) => {
      setPhaseMetricOverrides((prev) => {
        const currentTotalMinutes = parseNonNegativeInt(prev[field]);
        const currentHours = Math.floor(currentTotalMinutes / 60);
        const currentMinutes = roundToNearestFive(currentTotalMinutes % 60);

        if (unit === 'hours') {
          const nextHours = parseNonNegativeInt(rawValue);
          return {
            ...prev,
            [field]: String(nextHours * 60 + currentMinutes),
          };
        }

        const nextMinutes = Math.min(55, roundToNearestFive(parseNonNegativeInt(rawValue)));
        return {
          ...prev,
          [field]: String(currentHours * 60 + nextMinutes),
        };
      });
    },
    []
  );
  const [distanceOverrideKm, setDistanceOverrideKm] = useState('');
  const [savingDistanceOverride, setSavingDistanceOverride] = useState(false);
  const [distanceOverrideError, setDistanceOverrideError] = useState<string | null>(null);
  const [distanceOverrideSuccess, setDistanceOverrideSuccess] = useState<string | null>(null);

  const [phaseDistanceKm, setPhaseDistanceKm] = useState({
    signs_placed: 0,
    signs_picked_up: 0,
  });
  const [currentPosition, setCurrentPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapTheme, setMapTheme] = useState<MapTheme>('dark');

  // Persist theme selection in localStorage for user convenience
  useEffect(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem('operatorMapTheme') : null;
    if (stored && MAP_THEMES.some(t => t.key === stored)) {
      setMapTheme(stored as MapTheme);
    }
  }, []);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('operatorMapTheme', mapTheme);
    }
  }, [mapTheme]);
  const gpsWatchIdRef = useRef<number | null>(null);
  const lastGpsPointRef = useRef<{ lat: number; lng: number } | null>(null);
  const phaseInputSeedRef = useRef<string | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void>; addEventListener?: (type: string, listener: () => void) => void } | null>(null);

  const fetchStops = useCallback(async () => {
    const client = generateClient<Schema>();
    const { data, errors } = await client.models.Stop.list({
      filter: { routeId: { eq: id } },
    });
    if (!errors || errors.length === 0) {
      const sorted = [...((data as unknown as Stop[]) || [])].sort(
        (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
      );
      setStops(sorted);
    }
  }, [id]);

  const handleStopCompleted = useCallback(async (stopId: string) => {
    if (!route || route.status !== 'in_progress' || !route.executionPhase) return;

    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    try {
      const completedAt = new Date().toISOString();
      const phase = route.executionPhase as ExecutionPhase;
      const completionMarker = phase === 'pickup' ? PICKUP_DONE_MARKER : PLACEMENT_DONE_MARKER;
      const skipMarker = phase === 'pickup' ? PICKUP_SKIPPED_MARKER : PLACEMENT_SKIPPED_MARKER;
      const existingStop = stops.find((s) => s.id === stopId);
      const arrivedAt = existingStop?.actualArrivalTime ?? completedAt;
      const withDoneMarker = upsertMarker(existingStop?.notes, completionMarker, completedAt);
      const normalizedNotes = removeMarker(withDoneMarker, skipMarker);
      const { errors } = await updateStopExecution(stopId, {
        actualArrivalTime: arrivedAt,
        actualDepartureTime: completedAt,
        notes: normalizedNotes,
      });
      if (!errors || errors.length === 0) {
        const updatedStops = stops.map((s) =>
          s.id === stopId
            ? {
                ...s,
                actualArrivalTime: arrivedAt,
                actualDepartureTime: completedAt,
                notes: normalizedNotes,
              }
            : s
        );
        setStops(updatedStops);

      }
    } catch { /* ignore */ }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, [route, stops]);

  const handleSkipStop = useCallback(async (stopId: string) => {
    if (!route || route.status !== 'in_progress' || !route.executionPhase) return;

    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    try {
      const now = new Date().toISOString();
      const phase = route.executionPhase as ExecutionPhase;
      const skipMarker = phase === 'pickup' ? PICKUP_SKIPPED_MARKER : PLACEMENT_SKIPPED_MARKER;
      const doneMarker = phase === 'pickup' ? PICKUP_DONE_MARKER : PLACEMENT_DONE_MARKER;
      const existingStop = stops.find((s) => s.id === stopId);
      const withSkipMarker = upsertMarker(existingStop?.notes, skipMarker, now);
      const skippedNotes = removeMarker(withSkipMarker, doneMarker);
      const { errors } = await updateStopExecution(stopId, {
        actualArrivalTime: now,
        actualDepartureTime: now,
        notes: skippedNotes,
      });
      if (!errors || errors.length === 0) {
        setStops((prev) =>
          prev.map((s) =>
            s.id === stopId
              ? { ...s, actualArrivalTime: now, actualDepartureTime: now, notes: skippedNotes }
              : s
          )
        );
      }
    } catch { /* ignore */ }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, [route, stops]);

  const persistStopOrder = useCallback(
    async (orderedStops: Stop[]) => {
      const client = generateClient<Schema>();
      const updates = orderedStops.map((stop, index) =>
        client.models.Stop.update({ id: stop.id, sequence: index + 1 })
      );
      await Promise.all(updates);
      await fetchStops();
    },
    [fetchStops]
  );

  const reorderStops = useCallback(
    async (reorderedStops: Stop[]) => {
      const resequenced = reorderedStops.map((stop, index) => ({
        ...stop,
        sequence: index + 1,
      }));

      setStops(resequenced);
      setReordering(true);
      setReorderError(null);

      try {
        await persistStopOrder(resequenced);
      } catch {
        setReorderError('Failed to save stop order. Restoring latest server order...');
        await fetchStops();
      } finally {
        setReordering(false);
      }
    },
    [fetchStops, persistStopOrder]
  );

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      setError(null);

      const routeResult = await getRouteDetail(id);
      if (routeResult.errors || !routeResult.data) {
        setError('Failed to load route.');
        setLoading(false);
        return;
      }
      const loadedRoute = routeResult.data as unknown as Route;
      setRoute(loadedRoute);
      setPhaseDistanceKm({
        signs_placed: loadedRoute.signsPlacedDistanceKm ?? 0,
        signs_picked_up: loadedRoute.signsPickedUpDistanceKm ?? 0,
      });

      const customerResult = await getCustomer(loadedRoute.customerId);
      if (!customerResult.errors || customerResult.errors.length === 0) {
        const customer = customerResult.data as {
          name?: string;
          addressLine1?: string | null;
          billingRatePerHour?: number | null;
          standingInstructions?: string | null;
          defaultNumberOfSigns?: number | null;
          defaultAgentName?: string | null;
          agentOptions?: string[] | null;
        } | null;
        setCustomerName(customer?.name || 'Unknown customer');
        setCustomerRatePerHour(typeof customer?.billingRatePerHour === 'number' ? customer.billingRatePerHour : null);
        setCustomerDefaults({
          standingInstructions: customer?.standingInstructions ?? null,
          defaultNumberOfSigns: customer?.defaultNumberOfSigns ?? null,
          defaultAgentName: customer?.defaultAgentName ?? null,
          agentOptions: customer?.agentOptions ?? null,
        });

        if (customer?.addressLine1) {
          try {
            const resolved = await geocodeAddress(customer.addressLine1);
            setCustomerAddressOrigin({ latitude: resolved.latitude, longitude: resolved.longitude });
          } catch {
            setCustomerAddressOrigin(null);
          }
        } else {
          setCustomerAddressOrigin(null);
        }
      }

      await fetchStops();
      setLoading(false);
    }
    if (id) fetchAll();
  }, [id, fetchStops]);

  useEffect(() => {
    if (!user?.userId) return;
    if (typeof getUserSettings !== 'function') return;
    let cancelled = false;

    void getUserSettings(user.userId)
      .then((result) => {
        if (cancelled || !result.data?.mapTheme) return;
        setMapTheme(result.data.mapTheme as MapTheme);
      })
      .catch(() => {
        // Non-blocking: map defaults to dark for field use.
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  useEffect(() => {
    if (!route || route.status !== 'in_progress' || !route.executionPhase) {
      if (gpsWatchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
      gpsWatchIdRef.current = null;
      lastGpsPointRef.current = null;
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    lastGpsPointRef.current = null;
    const activePhase = route.executionPhase === 'pickup' ? 'signs_picked_up' : 'signs_placed';

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const nextPoint = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        const previousPoint = lastGpsPointRef.current;
        lastGpsPointRef.current = nextPoint;

        // Update current position for map display
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        if (!previousPoint) {
          return;
        }

        const deltaKm = haversineDistanceKm(previousPoint, nextPoint);
        if (!Number.isFinite(deltaKm) || deltaKm <= 0 || deltaKm > 1) {
          return;
        }

        setPhaseDistanceKm((prev) => ({
          ...prev,
          [activePhase]: Number((prev[activePhase] + deltaKm).toFixed(3)),
        }));
      },
      () => {
        // Ignore GPS errors and keep execution flow manual-safe.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      }
    );

      setCurrentPosition(null);
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
      gpsWatchIdRef.current = null;
      lastGpsPointRef.current = null;
    };
  }, [route]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const isExecutionActive = route?.status === 'in_progress';
    const wakeLockApi = (
      navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<{
            release: () => Promise<void>;
            addEventListener?: (type: string, listener: () => void) => void;
          }>;
        };
      }
    ).wakeLock;

    let cancelled = false;

    const releaseWakeLock = async () => {
      if (!wakeLockRef.current) return;
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore release failures.
      } finally {
        wakeLockRef.current = null;
      }
    };

    const requestWakeLock = async () => {
      if (!wakeLockApi || !isExecutionActive || document.visibilityState !== 'visible') {
        return;
      }

      try {
        const sentinel = await wakeLockApi.request('screen');

        if (cancelled) {
          await sentinel.release();
          return;
        }

        wakeLockRef.current = sentinel;
        if (typeof sentinel.addEventListener === 'function') {
          sentinel.addEventListener('release', () => {
            if (wakeLockRef.current === sentinel) {
              wakeLockRef.current = null;
            }
          });
        }
      } catch {
        // Non-blocking fallback when wake lock is not supported or denied.
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isExecutionActive) {
        void requestWakeLock();
      }
    };

    if (isExecutionActive) {
      void requestWakeLock();
    } else {
      void releaseWakeLock();
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void releaseWakeLock();
    };
  }, [route?.status]);

  const handleStartRoute = async () => {
    if (!route) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const startedAt = new Date().toISOString();
      const isStartingPlacement = route.status === 'planned';
      const isStartingPickup = route.status === 'signs_placed';

      if (!isStartingPlacement && !isStartingPickup) {
        setTransitioning(false);
        return;
      }

      const { errors } = await updateRouteExecution(route.id, isStartingPlacement
        ? {
            status: 'in_progress',
            executionPhase: 'placement',
            actualStartTime: route.actualStartTime ?? startedAt,
            placementStartTime: startedAt,
            signsPlacedDistanceKm: route.signsPlacedDistanceKm ?? 0,
            signsPickedUpDistanceKm: route.signsPickedUpDistanceKm ?? 0,
          }
        : {
            status: 'in_progress',
            executionPhase: 'pickup',
            pickupStartTime: startedAt,
          });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to start route.');
      } else {
        if (isStartingPlacement) {
          setPhaseDistanceKm({ signs_placed: 0, signs_picked_up: 0 });
          setPhaseMetricOverrides({
            placementDistanceKm: '0.00',
            placementDurationMinutes: '0',
            pickupDistanceKm: '0.00',
            pickupDurationMinutes: '0',
          });
        } else if (isStartingPickup) {
          setPhaseMetricOverrides((prev) => ({
            ...prev,
            pickupDistanceKm: (route.signsPickedUpDistanceKm ?? 0).toFixed(2),
            pickupDurationMinutes: '0',
          }));
        }
        setRoute((r) =>
          r
            ? {
                ...r,
                status: 'in_progress',
                executionPhase: isStartingPlacement ? 'placement' : 'pickup',
                actualStartTime: isStartingPlacement ? (r.actualStartTime ?? startedAt) : r.actualStartTime,
                placementStartTime: isStartingPlacement ? startedAt : r.placementStartTime,
                pickupStartTime: isStartingPickup ? startedAt : r.pickupStartTime,
                signsPlacedDistanceKm: isStartingPlacement ? 0 : r.signsPlacedDistanceKm,
                signsPickedUpDistanceKm: isStartingPlacement ? 0 : r.signsPickedUpDistanceKm,
              }
            : r
        );
      }
    } catch {
      setTransitionError('Failed to start route.');
    }
    setTransitioning(false);
  };

  const handleEndRoute = async () => {
    if (!route) return;
    setTransitioning(true);
    setTransitionError(null);

    try {
      if (route.status !== 'in_progress' || !route.executionPhase) {
        setTransitioning(false);
        return;
      }

      const now = new Date();
      const endedAt = now.toISOString();
      const isEndingPlacement = route.executionPhase === 'placement';
      const placementDistanceOverrideKm = Number(phaseMetricOverrides.placementDistanceKm);
      const pickupDistanceOverrideKm = Number(phaseMetricOverrides.pickupDistanceKm);
      const placementDurationOverrideMinutes = Number(phaseMetricOverrides.placementDurationMinutes);
      const pickupDurationOverrideMinutes = Number(phaseMetricOverrides.pickupDurationMinutes);

      const parsedDistanceKm = isEndingPlacement ? placementDistanceOverrideKm : pickupDistanceOverrideKm;
      const parsedDurationMinutes = isEndingPlacement ? placementDurationOverrideMinutes : pickupDurationOverrideMinutes;

      if (!Number.isFinite(parsedDistanceKm) || parsedDistanceKm < 0) {
        setTransitionError('Distance must be a number greater than or equal to 0.');
        setTransitioning(false);
        return;
      }

      if (!Number.isFinite(parsedDurationMinutes) || parsedDurationMinutes < 0) {
        setTransitionError('Duration must be a number greater than or equal to 0.');
        setTransitioning(false);
        return;
      }

      const phaseDistanceOverrideKm = Number(parsedDistanceKm.toFixed(2));
      const roundedPlacementDistanceKm = Number((Number.isFinite(placementDistanceOverrideKm) ? placementDistanceOverrideKm : 0).toFixed(2));
      const roundedPickupDistanceKm = Number((Number.isFinite(pickupDistanceOverrideKm) ? pickupDistanceOverrideKm : 0).toFixed(2));
      const roundedPlacementDurationMinutes = Math.max(0, Math.round(Number.isFinite(placementDurationOverrideMinutes) ? placementDurationOverrideMinutes : 0));
      const roundedPickupDurationMinutes = Math.max(0, Math.round(Number.isFinite(pickupDurationOverrideMinutes) ? pickupDurationOverrideMinutes : 0));

      const pickupDistanceKm = isEndingPlacement
        ? roundedPickupDistanceKm
        : phaseDistanceOverrideKm;
      const placementDistanceKm = isEndingPlacement
        ? phaseDistanceOverrideKm
        : roundedPlacementDistanceKm;

      const startForDuration = route.actualStartTime
        ?? route.placementStartTime
        ?? route.pickupStartTime
        ?? endedAt;
      const computedRouteDurationMinutes = Math.max(
        0,
        Math.round((now.getTime() - new Date(startForDuration).getTime()) / 60000)
      );
      const placementStartForDuration = route.placementStartTime ?? route.actualStartTime ?? endedAt;
      const computedPlacementDurationMinutes = Math.max(
        0,
        Math.round((now.getTime() - new Date(placementStartForDuration).getTime()) / 60000)
      );
      const totalOverrideDurationMinutes = roundedPlacementDurationMinutes + roundedPickupDurationMinutes;
      const actualDurationMinutes = isEndingPlacement
        ? (roundedPlacementDurationMinutes || computedPlacementDurationMinutes)
        : (totalOverrideDurationMinutes || computedRouteDurationMinutes);
      const persistedOverrideDurationMinutes = isEndingPlacement
        ? roundedPlacementDurationMinutes
        : totalOverrideDurationMinutes;

      const { errors } = await updateRouteExecution(route.id, isEndingPlacement
        ? {
            status: 'signs_placed',
            executionPhase: 'placement',
            placementEndTime: endedAt,
            signsPlacedDistanceKm: placementDistanceKm,
            signsPickedUpDistanceKm: pickupDistanceKm,
            actualDurationMinutes,
          }
        : {
            status: 'signs_picked_up',
            executionPhase: 'pickup',
            pickupEndTime: endedAt,
            actualEndTime: endedAt,
            actualDurationMinutes,
            signsPlacedDistanceKm: placementDistanceKm,
            signsPickedUpDistanceKm: pickupDistanceKm,
          });

      if (errors && errors.length > 0) {
        setTransitionError('Failed to end route phase.');
      } else {
        await updateRoute(route.id, {
          overrideDurationMinutes: persistedOverrideDurationMinutes,
        });

        setRoute((r) =>
          r
            ? {
                ...r,
                status: isEndingPlacement ? 'signs_placed' : 'signs_picked_up',
                executionPhase: route.executionPhase,
                placementEndTime: isEndingPlacement ? endedAt : r.placementEndTime,
                pickupEndTime: isEndingPlacement ? r.pickupEndTime : endedAt,
                actualEndTime: isEndingPlacement ? r.actualEndTime : endedAt,
                actualDurationMinutes,
                overrideDurationMinutes: persistedOverrideDurationMinutes,
                signsPlacedDistanceKm: placementDistanceKm,
                signsPickedUpDistanceKm: pickupDistanceKm,
              }
            : r
        );
        setPhaseDistanceKm({
          signs_placed: placementDistanceKm,
          signs_picked_up: pickupDistanceKm,
        });
      }
    } catch {
      setTransitionError('Failed to end route phase.');
    }

    setTransitioning(false);
  };

  const handleCompleteRoute = async () => {
    if (!route || route.status !== 'signs_picked_up' || !canManagePlanning) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const { errors } = await updateRouteExecution(route.id, { status: 'completed' });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to complete route.');
      } else {
        setRoute((r) => (r ? { ...r, status: 'completed' } : r));
      }
    } catch {
      setTransitionError('Failed to complete route.');
    }
    setTransitioning(false);
  };

  const handleConfirmCompletion = async () => {
    if (!route) return;
    const confirmed = window.confirm(
      `Archive route ${route.routeCode || route.id.slice(0, 8)}? Archived routes are no longer active.`
    );
    if (!confirmed) return;

    setTransitioning(true);
    setTransitionError(null);
    try {
      const { errors } = await updateRouteExecution(route.id, { status: 'archived' });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to confirm route completion.');
      } else {
        setRoute((r) => (r ? { ...r, status: 'archived' } : r));
      }
    } catch {
      setTransitionError('Failed to confirm route completion.');
    }
    setTransitioning(false);
  };

  const handleSaveDistanceOverride = async () => {
    if (!route || !canManagePlanning) return;

    const parsedDistance = Number(distanceOverrideKm);
    if (Number.isNaN(parsedDistance) || parsedDistance < 0) {
      setDistanceOverrideError('Distance must be a number greater than or equal to 0.');
      setDistanceOverrideSuccess(null);
      return;
    }

    setSavingDistanceOverride(true);
    setDistanceOverrideError(null);
    setDistanceOverrideSuccess(null);

    try {
      const { errors } = await updateRoute(route.id, {
        overrideDistanceKm: Number(parsedDistance.toFixed(2)),
      });

      if (errors && errors.length > 0) {
        setDistanceOverrideError('Failed to save distance override.');
      } else {
        setRoute((current) =>
          current
            ? {
                ...current,
                overrideDistanceKm: Number(parsedDistance.toFixed(2)),
              }
            : current
        );
        setDistanceOverrideSuccess('Distance override saved.');
      }
    } catch {
      setDistanceOverrideError('Failed to save distance override.');
    }

    setSavingDistanceOverride(false);
  };

  const handleAddStop = async (values: {
    address: string;
    serviceType: 'delivery' | 'pickup' | 'inspection';
    numberOfSigns?: number;
    agent?: string;
    isAuction?: boolean;
    notes?: string;
    latitude?: number;
    longitude?: number;
    formattedAddress?: string;
  }) => {
    if (!route) return;
    if (!canManagePlanning) {
      setAddStopError('Only administrators can add planned stops.');
      return;
    }

    setAddingStop(true);
    setAddStopError(null);
    try {
      let lat = values.latitude;
      let lng = values.longitude;
      let formatted = values.formattedAddress ?? values.address;

      if (lat === undefined || lng === undefined) {
        const geocoded = await geocodeAddress(values.address);
        lat = geocoded.latitude;
        lng = geocoded.longitude;
        formatted = geocoded.formattedAddress;
      }

      const result = await createStop({
        routeId: route.id,
        customerId: route.customerId,
        sequence: stops.length + 1,
        address: values.address,
        formattedAddress: formatted,
        latitude: lat,
        longitude: lng,
        serviceType: values.serviceType,
        numberOfSigns: values.numberOfSigns,
        agent: values.agent,
        isAuction: values.isAuction,
        notes: values.notes,
      });
      if (result.errors && result.errors.length > 0) {
        setAddStopError('Failed to add stop.');
      } else {
        setShowAddStop(false);
        await fetchStops();
      }
    } catch {
      setAddStopError('Failed to add stop.');
    }
    setAddingStop(false);
  };

  const handleEditStop = async (values: {
    address: string;
    serviceType: 'delivery' | 'pickup' | 'inspection';
    numberOfSigns?: number;
    agent?: string;
    isAuction?: boolean;
    notes?: string;
    latitude?: number;
    longitude?: number;
    formattedAddress?: string;
  }) => {
    if (!editingStopId) return;
    if (!canManagePlanning) {
      setEditStopError('Only administrators can edit planned stops.');
      return;
    }

    setEditingStop(true);
    setEditStopError(null);
    try {
      let lat = values.latitude;
      let lng = values.longitude;
      let formatted = values.formattedAddress ?? values.address;

      if (lat === undefined || lng === undefined) {
        const geocoded = await geocodeAddress(values.address);
        lat = geocoded.latitude;
        lng = geocoded.longitude;
        formatted = geocoded.formattedAddress;
      }

      const result = await updateStop({
        id: editingStopId,
        address: values.address,
        formattedAddress: formatted,
        latitude: lat,
        longitude: lng,
        serviceType: values.serviceType,
        numberOfSigns: values.numberOfSigns,
        agent: values.agent,
        isAuction: values.isAuction,
        notes: values.notes,
      });
      if (result.errors && result.errors.length > 0) {
        setEditStopError('Failed to update stop.');
      } else {
        setEditingStopId(null);
        await fetchStops();
      }
    } catch {
      setEditStopError('Failed to update stop.');
    }
    setEditingStop(false);
  };

  const handleDeleteStop = async (stopId: string) => {
    if (!canManagePlanning || deletingStopId) {
      return;
    }
    setDeletingStopId(stopId);
    setReorderError(null);
    try {
      const result = await deleteStop(stopId);
      if (result.errors && result.errors.length > 0) {
        setReorderError('Failed to delete stop. Please try again.');
        return;
      }

      const remaining = stops.filter((s) => s.id !== stopId);
      const client = generateClient<Schema>();
      await Promise.all(
        remaining.map((s, idx) =>
          client.models.Stop.update({ id: s.id, sequence: idx + 1 })
        )
      );
      setPendingDeleteStopId(null);
      await fetchStops();
    } catch {
      setReorderError('Failed to delete stop. Please try again.');
    } finally {
      setDeletingStopId(null);
    }
  };

  const handleDropStop = async (targetStopId: string) => {
    if (!canManagePlanning || !draggingStopId || draggingStopId === targetStopId || reordering) {
      setDraggingStopId(null);
      return;
    }

    const fromIndex = stops.findIndex((stop) => stop.id === draggingStopId);
    const toIndex = stops.findIndex((stop) => stop.id === targetStopId);

    if (fromIndex === -1 || toIndex === -1) {
      setDraggingStopId(null);
      return;
    }

    const reordered = [...stops];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    try {
      await reorderStops(reordered);
    } catch {
      setReorderError('Failed to save stop order. Restoring latest server order...');
      await fetchStops();
    } finally {
      setDraggingStopId(null);
    }
  };

  const handleMoveStop = async (stopId: string, direction: 'up' | 'down') => {
    if (!canManagePlanning || reordering) {
      return;
    }

    const currentIndex = stops.findIndex((stop) => stop.id === stopId);
    if (currentIndex === -1) {
      return;
    }

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= stops.length) {
      return;
    }

    const reordered = [...stops];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    await reorderStops(reordered);
  };

  const handleDeleteRoute = async () => {
    if (!route || !canManagePlanning || deletingRoute) return;

    const confirmed = window.confirm(
      `Delete route ${route.routeCode || route.id.slice(0, 8)}? This will also delete all stops on the route.`
    );
    if (!confirmed) return;

    setDeletingRoute(true);
    setError(null);

    const result = await deleteRoute(route.id);
    if (result.errors && result.errors.length > 0) {
      setError('Failed to delete route.');
      setDeletingRoute(false);
      return;
    }

    router.push('/operator/routes');
  };

  const planningLocked = route?.status !== 'planned';
  const isExecutionMode = route?.status === 'in_progress';
  const currentExecutionPhase = route?.executionPhase === 'pickup' ? 'pickup' : 'placement';
  const placementPhaseStops = stops.filter((stop) => stop.serviceType !== 'pickup');
  const pickupPhaseStops = stops.filter((stop) => stop.serviceType !== 'inspection');
  const visibleStops = (() => {
    if (!route) return stops;

    if (isPlacementPhase(route.status, route.executionPhase)) {
      return placementPhaseStops.filter((stop) => !isStopCompletedForPhase(stop, 'placement'));
    }

    if (route.status === 'signs_placed' || isPickupPhase(route.status, route.executionPhase)) {
      return pickupPhaseStops.filter((stop) => !isStopCompletedForPhase(stop, 'pickup'));
    }

    return stops;
  })();
  const topVisibleStopId = visibleStops[0]?.id ?? null;
  const allPlacementStopsCompleted =
    placementPhaseStops.length === 0 || placementPhaseStops.every((stop) => isStopCompletedForPhase(stop, 'placement'));
  const allPickupStopsCompleted =
    pickupPhaseStops.length === 0 || pickupPhaseStops.every((stop) => isStopCompletedForPhase(stop, 'pickup'));
  const canEndCurrentPhase =
    currentExecutionPhase === 'pickup' ? allPickupStopsCompleted : allPlacementStopsCompleted;
  const completedStops = stops.filter((stop) => isStopCompleted(stop));
  const summaryStops = route?.status === 'completed' || route?.status === 'archived'
    ? completedStops.length > 0
      ? completedStops
      : stops
    : stops;
  const routeDurationMinutes = route ? getRouteDurationMinutes(route) : null;
  const kilometersTravelled = calculateRouteDistanceKm(summaryStops);
  const effectiveKilometersTravelled = route?.overrideDistanceKm ?? kilometersTravelled;
  const totalStops = summaryStops.length;
  const totalSigns = summaryStops.reduce(
    (sum, stop) => sum + (typeof stop.numberOfSigns === 'number' ? stop.numberOfSigns : 0),
    0
  );
  const completionAmount =
    routeDurationMinutes !== null && customerRatePerHour !== null
      ? Number(((routeDurationMinutes / 60) * customerRatePerHour).toFixed(2))
      : null;
  const availableAgentsForStops = useMemo(() => {
    const customerAgents = customerDefaults?.agentOptions ?? [];
    const routeAgents = stops
      .map((stop) => stop.agent?.trim())
      .filter((agent): agent is string => Boolean(agent));

    return Array.from(new Set([...customerAgents, ...routeAgents]));
  }, [customerDefaults?.agentOptions, stops]);
  const defaultAgentForStops = customerDefaults?.defaultAgentName ?? availableAgentsForStops[0] ?? undefined;
  const placementDistance = phaseDistanceKm.signs_placed;
  const pickupDistance = phaseDistanceKm.signs_picked_up;
  const isPickupExecutionPhase = route?.status === 'in_progress' && route.executionPhase === 'pickup';
  const phaseLabelPrefix = isPickupExecutionPhase ? 'Pickup' : 'Placement';
  const nextExecutionStop = isExecutionMode ? visibleStops[0] : null;
  const upcomingExecutionStops = isExecutionMode ? visibleStops.slice(1, 3) : [];
  const upcomingExecutionStopIds = upcomingExecutionStops.map((stop) => stop.id);

  useEffect(() => {
    if (!route || route.status !== 'in_progress' || !route.executionPhase) {
      phaseInputSeedRef.current = null;
      return;
    }

    const phaseKey = `${route.id}:${route.status}:${route.executionPhase}`;
    if (phaseInputSeedRef.current === phaseKey) {
      return;
    }
    phaseInputSeedRef.current = phaseKey;

    setPhaseMetricOverrides({
      placementDistanceKm: phaseDistanceKm.signs_placed.toFixed(2),
      placementDurationMinutes: String(getPhaseDurationMinutes(route, 'placement')),
      pickupDistanceKm: phaseDistanceKm.signs_picked_up.toFixed(2),
      pickupDurationMinutes: String(getPhaseDurationMinutes(route, 'pickup')),
    });
  }, [
    phaseDistanceKm.signs_picked_up,
    phaseDistanceKm.signs_placed,
    route,
  ]);

  useEffect(() => {
    if (!route) return;
    const initialDistance = route.overrideDistanceKm ?? kilometersTravelled;
    setDistanceOverrideKm(initialDistance.toFixed(2));
    setDistanceOverrideError(null);
    setDistanceOverrideSuccess(null);
  }, [kilometersTravelled, route]);

  if (loading) return <LoadingSpinner message="Loading route..." />;

  return (
    <div className={styles.container}>
      {/* Back link */}
      <Link href="/operator/routes" className={styles.backLink}>
        ← Back to Routes
      </Link>

      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      {route && (
        <>
          {/* Route Header */}
          {!isExecutionMode && (
          <div className={styles.routeCard}>
            <div className={styles.routeCardHeader}>
              <h1 className={styles.routeTitle}>
                Route {route.routeCode || route.id.slice(0, 8)}
              </h1>
              <StatusBadge status={route.status} />
              {canManagePlanning && (
                <Link href={`/administrator/routes/edit?id=${route.id}`} className={styles.btnRouteEdit}>
                  Edit Route
                </Link>
              )}
              {canManagePlanning && (
                <button
                  onClick={() => {
                    void handleDeleteRoute();
                  }}
                  className={styles.btnRouteDelete}
                  disabled={deletingRoute}
                >
                  {deletingRoute ? 'Deleting...' : 'Delete Route'}
                </button>
              )}
            </div>

            <div className={styles.routeInfoGrid}>
              <div>
                <div className={styles.infoLabel}>Customer</div>
                <div className={styles.infoValue}>{customerName || 'Unknown customer'}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>Created</div>
                <div className={styles.infoValue}>{formatRouteDate(route.createdAt)}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>Time Taken</div>
                <div className={styles.infoValue}>{formatElapsedMinutes(routeDurationMinutes)}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>Kilometers</div>
                <div className={styles.infoValue}>{`${effectiveKilometersTravelled.toFixed(2)} km`}</div>
              </div>
              <div className={styles.phaseCompletionControls}>
                <label className={styles.phaseCompletionField}>
                  <span className={styles.infoLabel}>Placement Distance (km)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={styles.phaseCompletionInput}
                    value={phaseMetricOverrides.placementDistanceKm}
                    onChange={(event) =>
                      setPhaseMetricOverrides((prev) => ({ ...prev, placementDistanceKm: event.target.value }))
                    }
                    disabled={transitioning}
                  />
                </label>
                <label className={styles.phaseCompletionField}>
                  <span className={styles.infoLabel}>Placement Time</span>
                  <div className={styles.phaseDurationSpinnerRow}>
                    <label className={styles.phaseDurationUnit}>
                      <span className={styles.phaseDurationUnitLabel}>h</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={styles.phaseCompletionInput}
                        value={Math.floor(parseNonNegativeInt(phaseMetricOverrides.placementDurationMinutes) / 60)}
                        onChange={(event) => updatePhaseDurationFromSpinner('placementDurationMinutes', 'hours', event.target.value)}
                        disabled={transitioning}
                      />
                    </label>
                    <label className={styles.phaseDurationUnit}>
                      <span className={styles.phaseDurationUnitLabel}>m</span>
                      <input
                        type="number"
                        min="0"
                        max="55"
                        step="5"
                        className={styles.phaseCompletionInput}
                        value={roundToNearestFive(parseNonNegativeInt(phaseMetricOverrides.placementDurationMinutes) % 60)}
                        onChange={(event) => updatePhaseDurationFromSpinner('placementDurationMinutes', 'minutes', event.target.value)}
                        disabled={transitioning}
                      />
                    </label>
                  </div>
                </label>
                <label className={styles.phaseCompletionField}>
                  <span className={styles.infoLabel}>Pickup Distance (km)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={styles.phaseCompletionInput}
                    value={phaseMetricOverrides.pickupDistanceKm}
                    onChange={(event) =>
                      setPhaseMetricOverrides((prev) => ({ ...prev, pickupDistanceKm: event.target.value }))
                    }
                    disabled={transitioning}
                  />
                </label>
                <label className={styles.phaseCompletionField}>
                  <span className={styles.infoLabel}>Pickup Time</span>
                  <div className={styles.phaseDurationSpinnerRow}>
                    <label className={styles.phaseDurationUnit}>
                      <span className={styles.phaseDurationUnitLabel}>h</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        className={styles.phaseCompletionInput}
                        value={Math.floor(parseNonNegativeInt(phaseMetricOverrides.pickupDurationMinutes) / 60)}
                        onChange={(event) => updatePhaseDurationFromSpinner('pickupDurationMinutes', 'hours', event.target.value)}
                        disabled={transitioning}
                      />
                    </label>
                    <label className={styles.phaseDurationUnit}>
                      <span className={styles.phaseDurationUnitLabel}>m</span>
                      <input
                        type="number"
                        min="0"
                        max="55"
                        step="5"
                        className={styles.phaseCompletionInput}
                        value={roundToNearestFive(parseNonNegativeInt(phaseMetricOverrides.pickupDurationMinutes) % 60)}
                        onChange={(event) => updatePhaseDurationFromSpinner('pickupDurationMinutes', 'minutes', event.target.value)}
                        disabled={transitioning}
                      />
                    </label>
                  </div>
                </label>
              </div>
            </div>

            {route.notes && (
              <div className={styles.routeNotes}>
                <span className={styles.routeNotesBold}>Notes: </span>
                {route.notes}
              </div>
            )}

            {/* Status transitions */}
            <div className={styles.transitionRow}>
              {route.status === 'in_progress' && (
                <div className={styles.infoLabel}>{`Ending ${phaseLabelPrefix} phase using header metrics`}</div>
              )}
              {route.status === 'planned' && (
                <button
                  onClick={handleStartRoute}
                  disabled={transitioning}
                  className={styles.btnStart}
                >
                  {transitioning ? 'Starting…' : 'Start Route'}
                </button>
              )}
              {route.status === 'in_progress' && (
                <button
                  onClick={handleEndRoute}
                  disabled={transitioning || !canEndCurrentPhase}
                  className={styles.btnComplete}
                >
                  {transitioning
                    ? 'Updating…'
                    : !canEndCurrentPhase
                    ? 'Action Stops First'
                    : 'End Route'}
                </button>
              )}
              {route.status === 'signs_placed' && (
                <button
                  onClick={handleStartRoute}
                  disabled={transitioning}
                  className={styles.btnStart}
                >
                  {transitioning ? 'Starting…' : 'Start Route'}
                </button>
              )}
              {canManagePlanning && route.status === 'signs_picked_up' && (
                <button
                  onClick={handleCompleteRoute}
                  disabled={transitioning}
                  className={styles.btnComplete}
                >
                  {transitioning ? 'Completing…' : 'Complete Route'}
                </button>
              )}
              {canManagePlanning && route.status === 'completed' && (
                <button
                  onClick={handleConfirmCompletion}
                  disabled={transitioning}
                  className={styles.btnComplete}
                >
                  {transitioning ? 'Confirming…' : 'Confirm Completion'}
                </button>
              )}
              {transitionError && (
                <span className={styles.transitionError}>{transitionError}</span>
              )}
            </div>

            {(route.status === 'completed' || route.status === 'archived') && (
              <div className={styles.summaryCard}>
                <h3 className={styles.summaryHeading}>Final Route Summary</h3>
                <div className={styles.summaryGrid}>
                  <div>
                    <div className={styles.infoLabel}>Kilometers Travelled</div>
                    <div className={styles.infoValue}>{`${effectiveKilometersTravelled.toFixed(2)} km`}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Placement Distance</div>
                    <div className={styles.infoValue}>{`${placementDistance.toFixed(2)} km`}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Pickup Distance</div>
                    <div className={styles.infoValue}>{`${pickupDistance.toFixed(2)} km`}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Time Taken</div>
                    <div className={styles.infoValue}>{formatElapsedMinutes(routeDurationMinutes)}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Stops</div>
                    <div className={styles.infoValue}>{totalStops}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Total Number of Signs</div>
                    <div className={styles.infoValue}>{totalSigns}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Customer Rate</div>
                    <div className={styles.infoValue}>
                      {customerRatePerHour === null ? '—' : formatCurrency(customerRatePerHour)} / hr
                    </div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Amount</div>
                    <div className={styles.infoValue}>{formatCurrency(completionAmount)}</div>
                  </div>
                </div>

                {canManagePlanning && route.status === 'completed' && (
                  <div className={styles.distanceOverrideSection}>
                    <h4 className={styles.distanceOverrideHeading}>Distance Override</h4>
                    <div className={styles.distanceOverrideRow}>
                      <label className={styles.distanceOverrideLabel} htmlFor="distanceOverrideKm">
                        Kilometers Travelled
                      </label>
                      <input
                        id="distanceOverrideKm"
                        type="number"
                        min="0"
                        step="0.01"
                        className={styles.distanceOverrideInput}
                        value={distanceOverrideKm}
                        onChange={(event) => setDistanceOverrideKm(event.target.value)}
                        disabled={savingDistanceOverride}
                      />
                      <button
                        type="button"
                        className={styles.btnSaveDistanceOverride}
                        onClick={() => {
                          void handleSaveDistanceOverride();
                        }}
                        disabled={savingDistanceOverride}
                      >
                        {savingDistanceOverride ? 'Saving…' : 'Save Distance'}
                      </button>
                    </div>
                    {distanceOverrideError && <div className={styles.errorBanner}>{distanceOverrideError}</div>}
                    {distanceOverrideSuccess && <div className={styles.distanceOverrideSuccess}>{distanceOverrideSuccess}</div>}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Stops Section */}
          {isExecutionMode ? (
            <section role="region" aria-label="Operator field mode" className={styles.fieldMode}>
              <div className={styles.fieldModeHeader}>
                <div>
                  <p className={styles.fieldModeEyebrow}>{phaseLabelPrefix} phase</p>
                  <h1 className={styles.fieldModeTitle}>
                    Route {route.routeCode || route.id.slice(0, 8)}
                  </h1>
                </div>
                <StatusBadge status={route.status} />
              </div>

              <div className={styles.fieldModeTelemetry}>
                <div>
                  <span className={styles.infoLabel}>Vehicle location</span>
                  <span className={styles.fieldModeTelemetryValue}>
                    {currentPosition ? 'Live GPS active' : 'Waiting for GPS'}
                  </span>
                </div>
                <div>
                  <span className={styles.infoLabel}>Phase distance</span>
                  <span className={styles.fieldModeTelemetryValue}>
                    {`${(currentExecutionPhase === 'pickup' ? pickupDistance : placementDistance).toFixed(2)} km`}
                  </span>
                </div>
                <div>
                  <span className={styles.infoLabel}>Remaining stops</span>
                  <span className={styles.fieldModeTelemetryValue}>{visibleStops.length}</span>
                </div>
              </div>

              <div className={styles.fieldModeMapPanel}>
                <div className={styles.fieldModeSectionHeader}>
                  <h2>Navigation</h2>
                  <span>Next stop highlighted</span>
                </div>
                <RouteStopsMap
                  stops={stops}
                  activeStopId={topVisibleStopId}
                  upcomingStopIds={upcomingExecutionStopIds}
                  currentPosition={currentPosition}
                  mapTheme={mapTheme}
                  presentation="field"
                />
              </div>

              <div className={styles.fieldModeGrid}>
                <article className={styles.fieldNextStopPanel}>
                  <div className={styles.fieldModeSectionHeader}>
                    <h2>Next stop</h2>
                    {nextExecutionStop && (
                      <span>{getStopStatusLabel(nextExecutionStop, currentExecutionPhase)}</span>
                    )}
                  </div>

                  {nextExecutionStop ? (
                    <>
                      <div className={styles.fieldStopAddress}>
                        {getPrimaryAddressLine(nextExecutionStop.formattedAddress || nextExecutionStop.address)}
                      </div>
                      <div className={styles.fieldStopMetaGrid}>
                        <div>
                          <span className={styles.infoLabel}>Sequence</span>
                          <span className={styles.fieldModeTelemetryValue}>{nextExecutionStop.sequence ?? '-'}</span>
                        </div>
                        <div>
                          <span className={styles.infoLabel}>Signs</span>
                          <span className={styles.fieldModeTelemetryValue}>{nextExecutionStop.numberOfSigns ?? '-'}</span>
                        </div>
                        <div>
                          <span className={styles.infoLabel}>Agent</span>
                          <span className={styles.fieldModeTelemetryValue}>{nextExecutionStop.agent?.trim() || 'Unassigned'}</span>
                        </div>
                      </div>
                      <div className={styles.fieldPrimaryActions}>
                        <button
                          type="button"
                          onClick={() => { void handleStopCompleted(nextExecutionStop.id); }}
                          className={styles.btnFieldPrimary}
                          disabled={!!stopExecuting[nextExecutionStop.id]}
                        >
                          {stopExecuting[nextExecutionStop.id]
                            ? 'Saving...'
                            : currentExecutionPhase === 'pickup'
                            ? 'Signs Picked Up'
                            : 'Signs Placed'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { void handleSkipStop(nextExecutionStop.id); }}
                          className={styles.btnFieldSecondary}
                          disabled={!!stopExecuting[nextExecutionStop.id]}
                        >
                          Skip Stop
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className={styles.fieldEmptyText}>
                      {currentExecutionPhase === 'pickup'
                        ? 'All pickup stops are actioned. End the route when final checks are complete.'
                        : 'All placement stops are actioned. End this phase to prepare pickup.'}
                    </p>
                  )}
                </article>

                <aside className={styles.fieldUpcomingPanel}>
                  <div className={styles.fieldModeSectionHeader}>
                    <h2>Upcoming stops</h2>
                    <span>Next two</span>
                  </div>
                  {upcomingExecutionStops.length > 0 ? (
                    <ol className={styles.fieldUpcomingList}>
                      {upcomingExecutionStops.map((stop) => (
                        <li key={stop.id} className={styles.fieldUpcomingItem}>
                          <span className={styles.fieldUpcomingSequence}>{stop.sequence ?? '-'}</span>
                          <span>{getPrimaryAddressLine(stop.formattedAddress || stop.address)}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className={styles.fieldEmptyText}>No further stops in this phase.</p>
                  )}
                </aside>
              </div>

              <div className={styles.fieldModeFooter}>
                <button
                  type="button"
                  onClick={handleEndRoute}
                  disabled={transitioning || !canEndCurrentPhase}
                  className={styles.btnFieldComplete}
                >
                  {transitioning ? 'Updating...' : !canEndCurrentPhase ? 'Action Stops First' : 'End Route'}
                </button>
                {transitionError && (
                  <span className={styles.transitionError}>{transitionError}</span>
                )}
              </div>
            </section>
          ) : (
          <div className={styles.stopsSection}>
            <div className={styles.stopsHeader}>
              <h2 className={styles.stopsHeading}>
                Stops ({visibleStops.length})
              </h2>
              {canManagePlanning && !planningLocked && !showAddStop && (
                <button
                  onClick={() => setShowAddStop(true)}
                  className={styles.btnAddStop}
                >
                  Add Stop
                </button>
              )}
            </div>

            <div className={`${styles.mapSection} ${isExecutionMode ? styles.mapSectionExecutionMobile : ''}`}>
              <h3 className={styles.mapHeading}>Route Map</h3>
              <RouteStopsMap
                stops={stops}
                activeStopId={topVisibleStopId}
                currentPosition={currentPosition}
                mapTheme={mapTheme}
              />
            </div>

            {canManagePlanning && !planningLocked && (
              <div className={styles.reorderHint}>Drag and drop stop cards to change sequence.</div>
            )}
            {reordering && <div className={styles.reorderStatus}>Saving updated stop order...</div>}
            {reorderError && <div className={styles.errorBanner}>{reorderError}</div>}

            {/* Add Stop Form */}
            {showAddStop && !planningLocked && (
              <div className={styles.formContainer}>
                <h3 className={styles.formHeading}>Add Stop</h3>
                <StopForm
                  onSubmit={handleAddStop}
                  onCancel={() => {
                    setShowAddStop(false);
                    setAddStopError(null);
                  }}
                  addressSearchOrigin={customerAddressOrigin}
                  standingInstructions={customerDefaults?.standingInstructions ?? undefined}
                  defaultNumberOfSigns={customerDefaults?.defaultNumberOfSigns ?? undefined}
                  defaultAgentName={defaultAgentForStops}
                  availableAgents={availableAgentsForStops}
                  isSubmitting={addingStop}
                  error={addStopError}
                  submitLabel="Add Stop"
                />
              </div>
            )}

            {visibleStops.length === 0 && !showAddStop && (route?.status === 'in_progress' || route?.status === 'signs_placed') && (
              <div className={styles.emptyState}>
                {isPlacementPhase(route?.status, route?.executionPhase)
                  ? 'All signs are placed. Start the pickup phase to continue.'
                  : route?.status === 'signs_placed'
                  ? 'Ready for pickup phase. Click Start Route to begin pickup.'
                  : pickupPhaseStops.length === 0
                  ? 'No pickup-phase stops on this route. The route can be completed.'
                  : 'All pickup stops are complete. Click End Route to finish pickup phase.'}
              </div>
            )}

            {stops.length === 0 && !showAddStop && (
              <div className={styles.emptyState}>
                No stops yet. Click &quot;Add Stop&quot; to add the first one.
              </div>
            )}

            <div className={`${styles.stopsList} ${isExecutionMode ? styles.stopsListExecutionMobile : ''}`}>
              {visibleStops.map((stop, index) => {
                if (editingStopId === stop.id) {
                  return (
                    <div key={stop.id} className={styles.formContainer}>
                      <h3 className={styles.formHeading}>Edit Stop</h3>
                      <StopForm
                        initialValues={{
                          address: stop.address,
                          serviceType: stop.serviceType as 'delivery' | 'pickup' | 'inspection' | undefined,
                          numberOfSigns: stop.numberOfSigns ?? undefined,
                          agent: stop.agent ?? undefined,
                          isAuction: Boolean(stop.isAuction),
                          notes: stop.notes,
                        }}
                        onSubmit={handleEditStop}
                        onCancel={() => {
                          setEditingStopId(null);
                          setEditStopError(null);
                        }}
                        addressSearchOrigin={customerAddressOrigin}
                        standingInstructions={customerDefaults?.standingInstructions ?? undefined}
                        defaultNumberOfSigns={customerDefaults?.defaultNumberOfSigns ?? undefined}
                        defaultAgentName={defaultAgentForStops}
                        availableAgents={availableAgentsForStops}
                        isSubmitting={editingStop}
                        error={editStopError}
                        submitLabel="Save Changes"
                      />
                    </div>
                  );
                }

                const svcKey = (stop.serviceType as string) || 'delivery';
                const stopCardClass = { delivery: styles.cardDelivery, pickup: styles.cardPickup, inspection: styles.cardInspection }[svcKey] ?? '';
                const stopCircleClass = { delivery: styles.circleDelivery, pickup: styles.circlePickup, inspection: styles.circleInspection }[svcKey] ?? '';
                const agentName = stop.agent?.trim() || 'Unassigned';
                const agentInitials = getAgentBadgeInitials(agentName);
                const agentBadgeTone = getAgentBadgeTone(agentName);
                const isTopVisibleStop = stop.id === topVisibleStopId;
                const completedStop = isStopCompletedForPhase(stop, currentExecutionPhase);
                const executionActive = route?.status === 'in_progress';
                const phaseComplete = isStopCompletedForPhase(stop, currentExecutionPhase);
                const phaseSkipped = isStopSkippedForPhase(stop, currentExecutionPhase);
                const phaseCompletedAt = getPhaseCompletionTime(stop, currentExecutionPhase) ?? stop.actualDepartureTime;
                return (
                  <div
                    key={stop.id}
                    className={`${styles.stopCard} ${stopCardClass} ${isTopVisibleStop ? styles.stopCardTop : ''} ${completedStop ? styles.stopCardCompleted : ''} ${draggingStopId === stop.id ? styles.stopCardDragging : ''} ${isExecutionMode ? styles.stopCardExecutionCompact : ''}`}
                    draggable={canManagePlanning && !planningLocked && !reordering}
                    onDragStart={() => setDraggingStopId(stop.id)}
                    onDragOver={(event) => {
                      if (canManagePlanning && !planningLocked) {
                        event.preventDefault();
                      }
                    }}
                    onDrop={() => {
                      void handleDropStop(stop.id);
                    }}
                    onDragEnd={() => setDraggingStopId(null)}
                  >
                    <div className={`${styles.stopSegment} ${styles.stopSegmentNumber}`}>
                      <div className={`${styles.circle} ${stopCircleClass}`}>
                        {stop.sequence ?? '?'}
                      </div>
                    </div>

                    <div className={`${styles.stopSegment} ${styles.stopSegmentAddress}`}>
                      <div className={styles.stopAddress}>
                        {getPrimaryAddressLine(stop.formattedAddress || stop.address)}
                      </div>
                    </div>

                    <div className={`${styles.stopSegment} ${styles.stopSegmentMeta}`}>
                      <div className={styles.stopStatus}>{getStopStatusLabel(stop, currentExecutionPhase)}</div>
                      <span
                        className={`${styles.stopAgentBadge} ${styles.stopAgentBadgeCircle}`}
                        aria-label={agentName}
                        title={agentName}
                        style={{
                          '--nd-agent-badge-bg': agentBadgeTone.backgroundColor,
                          '--nd-agent-badge-fg': agentBadgeTone.color,
                        } as React.CSSProperties}
                      >
                        {agentInitials}
                      </span>
                    </div>

                    <div className={`${styles.stopSegment} ${styles.stopSegmentAction}`}>
                      {canManagePlanning && !planningLocked && !executionActive && (
                        <div className={styles.stopActions}>
                          <button
                            onClick={() => {
                              void handleMoveStop(stop.id, 'up');
                            }}
                            className={styles.btnReorder}
                            disabled={index === 0 || reordering}
                          >
                            Move Up
                          </button>
                          <button
                            onClick={() => {
                              void handleMoveStop(stop.id, 'down');
                            }}
                            className={styles.btnReorder}
                            disabled={index === visibleStops.length - 1 || reordering}
                          >
                            Move Down
                          </button>
                          <button
                            onClick={() => setEditingStopId(stop.id)}
                            className={styles.btnEdit}
                            disabled={reordering || !!deletingStopId}
                          >
                            Edit
                          </button>
                          {pendingDeleteStopId === stop.id ? (
                            <>
                              <button
                                onClick={() => {
                                  void handleDeleteStop(stop.id);
                                }}
                                className={styles.btnDelete}
                                disabled={reordering || !!deletingStopId}
                              >
                                {deletingStopId === stop.id ? 'Deleting...' : 'Confirm Delete'}
                              </button>
                              <button
                                onClick={() => setPendingDeleteStopId(null)}
                                className={styles.btnReorder}
                                disabled={reordering || !!deletingStopId}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setPendingDeleteStopId(stop.id)}
                              className={styles.btnDelete}
                              disabled={reordering || !!deletingStopId}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}

                      {executionActive && (
                        <>
                          {!phaseComplete && (
                            <div className={styles.execActionRow}>
                              <button
                                onClick={() => { void handleStopCompleted(stop.id); }}
                                className={styles.btnExecComplete}
                                disabled={!!stopExecuting[stop.id]}
                              >
                                {stopExecuting[stop.id]
                                  ? 'Saving…'
                                  : currentExecutionPhase === 'pickup'
                                  ? 'Signs Picked Up'
                                  : 'Signs Placed'}
                              </button>
                              <button
                                onClick={() => { void handleSkipStop(stop.id); }}
                                className={styles.btnSkip}
                                disabled={!!stopExecuting[stop.id]}
                              >
                                Skip Stop
                              </button>
                            </div>
                          )}
                          {phaseComplete && (
                            <div className={styles.execDone}>
                              {phaseSkipped ? (
                                <span className={styles.execSkippedBadge}>⏭ Skipped</span>
                              ) : (
                                <>
                                  <span>
                                    ✓ {currentExecutionPhase === 'pickup' ? 'Collected' : 'Placed'}:{' '}
                                    {formatRouteDateTime(phaseCompletedAt)}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

export default function RouteDetailPage() {
  return (
    <OperatorRoute>
      <Suspense fallback={<LoadingSpinner message="Loading route..." />}>
        <RouteDetailContent />
      </Suspense>
    </OperatorRoute>
  );
}
