'use client';

import { useEffect, useState, useCallback, useRef, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import ConfirmDialog from '@/app/components/ConfirmDialog';
import { useToast } from '@/app/components/ToastProvider';
import { StopForm } from '@/app/operator/components/StopForm';
import StopCard from '@/app/operator/components/StopCard';
import { RouteStatusPill } from '@/app/operator/components/RouteStatusPill';
import { StopCompletionDialog } from '@/app/operator/components/StopCompletionDialog';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { isAdmin } from '@/lib/amplify-config';
import { generateAgentInitials, getAgentBadgeTone } from '@/lib/customerDefaults';
import { geocodeAddress } from '@/lib/googleMaps';
import {
  calculateRouteDistanceKm,
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  getRouteDurationMinutes,
} from '@/lib/routeDetailHelpers';
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
import { parseRouteInstructions, sortRouteInstructionsNewestFirst } from '@/lib/routeInstructions';
import styles from './page.module.css';

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

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

function upsertMarker(notes: string | null | undefined, marker: string, atIso: string, reason?: string) {
  const base = removeMarker(notes ?? '', marker);
  const value = reason ? `${atIso}|${reason}` : atIso;
  return `${base}${base ? ' ' : ''}[${marker}:${value}]`;
}

function getMarkerTimestamp(notes: string | null | undefined, marker: string) {
  if (!notes) return null;
  const match = notes.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`));
  return match?.[1]?.split('|')[0] ?? null;
}

function getMarkerReason(notes: string | null | undefined, marker: string) {
  if (!notes) return null;
  const match = notes.match(new RegExp(`\\[${marker}:([^\\]]+)\\]`));
  const [, reason] = match?.[1]?.split('|') ?? [];
  return reason || null;
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

function isStopCompleted(stop: Stop) {
  return Boolean(stop.actualDepartureTime);
}

function getStopStatusLabel(stop: Stop, executionPhase?: ExecutionPhase | null) {
  if (executionPhase) {
    if (isStopSkippedForPhase(stop, executionPhase)) {
      const marker = executionPhase === 'pickup' ? PICKUP_SKIPPED_MARKER : PLACEMENT_SKIPPED_MARKER;
      const reason = getMarkerReason(stop.notes, marker);
      const base = executionPhase === 'pickup' ? 'Pickup skipped' : 'Placement skipped';
      return reason ? `${base} · ${reason}` : base;
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

function getSecondaryAddressLine(address?: string | null) {
  if (!address) return '';
  const [, ...rest] = address.split(',');
  return rest.join(',').trim();
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
  const { showToast } = useToast();

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
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [actionSheetStopId, setActionSheetStopId] = useState<string | null>(null);
  const [actionSheetStep, setActionSheetStep] = useState<'action' | 'reason'>('action');
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [showPhaseSummary, setShowPhaseSummary] = useState(false);
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
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsOnline(navigator.onLine);
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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
    if (!route || route.status !== 'in_progress' || !route.executionPhase) return false;

    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    let succeeded = false;
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
        showToast('Stop completed', 'success');
        succeeded = true;
      } else {
        showToast('Failed to complete stop. Please try again.', 'error');
      }
    } catch {
      showToast('Failed to complete stop. Please try again.', 'error');
    }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
    return succeeded;
  }, [route, stops, showToast]);

  const handleSkipStop = useCallback(async (stopId: string, reason: string) => {
    if (!route || route.status !== 'in_progress' || !route.executionPhase) return false;

    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    let succeeded = false;
    try {
      const now = new Date().toISOString();
      const phase = route.executionPhase as ExecutionPhase;
      const skipMarker = phase === 'pickup' ? PICKUP_SKIPPED_MARKER : PLACEMENT_SKIPPED_MARKER;
      const doneMarker = phase === 'pickup' ? PICKUP_DONE_MARKER : PLACEMENT_DONE_MARKER;
      const existingStop = stops.find((s) => s.id === stopId);
      const withSkipMarker = upsertMarker(existingStop?.notes, skipMarker, now, reason);
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
        showToast('Stop skipped', 'success');
        succeeded = true;
      } else {
        showToast('Failed to skip stop. Please try again.', 'error');
      }
    } catch {
      showToast('Failed to skip stop. Please try again.', 'error');
    }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
    return succeeded;
  }, [route, stops, showToast]);

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

      try {
        const routeResult = await getRouteDetail(id);
        if (routeResult.errors || !routeResult.data) {
          setError('Failed to load route.');
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
      } catch (err) {
        console.error('Error loading route detail:', err);
        setError('Failed to load route.');
      } finally {
        setLoading(false);
      }
    }
    if (id) {
      fetchAll();
    } else {
      setError('No route was specified.');
      setLoading(false);
    }
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
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    if (!route || route.status !== 'in_progress' || !route.executionPhase) {
      // Defensive: previous cleanup should already have cleared any watch,
      // but never leave a stale watch running outside execution mode.
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      lastGpsPointRef.current = null;
      return;
    }

    // Guards against position callbacks firing after cleanup (e.g. a callback
    // already queued when clearWatch runs on unmount).
    let cancelled = false;

    lastGpsPointRef.current = null;
    setCurrentPosition(null);
    const activePhase = route.executionPhase === 'pickup' ? 'signs_picked_up' : 'signs_placed';

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (cancelled) {
          return;
        }

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
    gpsWatchIdRef.current = watchId;

    return () => {
      cancelled = true;
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
      if (gpsWatchIdRef.current === watchId) {
        gpsWatchIdRef.current = null;
      }
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

        // The async request can resolve after cleanup (unmount or status
        // change) — release immediately instead of holding a stale lock.
        if (cancelled) {
          await sentinel.release();
          return;
        }

        // Release any previous sentinel before replacing it (e.g. when the
        // browser auto-released it on tab hide but did not fire 'release').
        if (wakeLockRef.current && wakeLockRef.current !== sentinel) {
          try {
            await wakeLockRef.current.release();
          } catch {
            // Ignore release failures on the stale sentinel.
          }
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
        setShowPhaseSummary(true);
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
    setShowArchiveConfirm(false);
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
  const upcomingExecutionStops = isExecutionMode ? visibleStops.slice(1) : [];
  const upcomingExecutionStopIds = upcomingExecutionStops.slice(0, 2).map((stop) => stop.id);
  const actionSheetStop = stops.find((stop) => stop.id === actionSheetStopId) ?? null;
  const totalPhaseStops = currentExecutionPhase === 'pickup' ? pickupPhaseStops.length : placementPhaseStops.length;
  const completedPhaseStops = Math.max(0, totalPhaseStops - visibleStops.length);
  const nextStopCounter = totalPhaseStops > 0 ? `STOP ${Math.min(totalPhaseStops, completedPhaseStops + 1)} OF ${totalPhaseStops}` : null;

  const justEndedPhase: ExecutionPhase | null = !showPhaseSummary
    ? null
    : route?.status === 'signs_placed'
    ? 'placement'
    : route?.status === 'signs_picked_up'
    ? 'pickup'
    : null;

  const phaseSummary = (() => {
    if (!justEndedPhase) return null;
    const phaseStops = justEndedPhase === 'placement' ? placementPhaseStops : pickupPhaseStops;
    const doneMarker = justEndedPhase === 'pickup' ? PICKUP_DONE_MARKER : PLACEMENT_DONE_MARKER;
    const skipMarker = justEndedPhase === 'pickup' ? PICKUP_SKIPPED_MARKER : PLACEMENT_SKIPPED_MARKER;

    const doneStops = phaseStops.filter((stop) => Boolean(getMarkerTimestamp(stop.notes, doneMarker)));
    const skippedStops = phaseStops.filter((stop) => isStopSkippedForPhase(stop, justEndedPhase));
    const notAttemptedCount = phaseStops.filter((stop) => !isStopCompletedForPhase(stop, justEndedPhase)).length;

    return {
      phase: justEndedPhase,
      totalStops: phaseStops.length,
      doneCount: doneStops.length,
      signsTotal: doneStops.reduce((sum, stop) => sum + (stop.numberOfSigns ?? 0), 0),
      distanceKm: justEndedPhase === 'pickup' ? pickupDistance : placementDistance,
      notAttemptedCount,
      skippedStops: skippedStops.map((stop) => ({
        id: stop.id,
        sequence: stop.sequence,
        address: getPrimaryAddressLine(stop.formattedAddress || stop.address),
        reason: getMarkerReason(stop.notes, skipMarker),
      })),
    };
  })();

  const openStopSheet = (stopId: string, step: 'action' | 'reason' = 'action') => {
    setActionSheetStopId(stopId);
    setActionSheetStep(step);
  };
  const closeStopSheet = () => setActionSheetStopId(null);

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
      <Breadcrumbs
        items={[
          { label: 'Routes', href: '/operator/routes' },
          { label: route ? `Route ${route.routeCode || route.id.slice(0, 8)}` : 'Route' },
        ]}
      />

      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      {route && (
        <>
          {/* Route Header */}
          {!isExecutionMode && (
          <Card>
            <div className={styles.routeCardHeader}>
              <h1 className={styles.routeTitle}>
                Route {route.routeCode || route.id.slice(0, 8)}
              </h1>
              <RouteStatusPill status={route.status} />
              {canManagePlanning && (
                <div className={styles.headerActions}>
                  <a href={`/administrator/routes/edit?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
                    Edit Route
                  </a>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deletingRoute}
                    onClick={() => {
                      void handleDeleteRoute();
                    }}
                  >
                    {deletingRoute ? 'Deleting...' : 'Delete Route'}
                  </Button>
                </div>
              )}
            </div>

            <div className={styles.factsGrid}>
              <div className="nd-stat">
                <span className="nd-stat__label">Customer</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{customerName || 'Unknown customer'}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Created</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{formatRouteDate(route.createdAt)}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Time Taken</span>
                <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{formatElapsedMinutes(routeDurationMinutes)}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Kilometers</span>
                <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${effectiveKilometersTravelled.toFixed(2)} km`}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Assigned Operator</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{route.assignedOperatorName || 'Unassigned'}</span>
              </div>
            </div>

            <div className={styles.phaseOverrideGrid}>
              <Field label="Placement Distance (km)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={phaseMetricOverrides.placementDistanceKm}
                  onChange={(event) =>
                    setPhaseMetricOverrides((prev) => ({ ...prev, placementDistanceKm: event.target.value }))
                  }
                  disabled={transitioning}
                />
              </Field>
              <div className={styles.durationField}>
                <span className="nd-field__label">Placement Time</span>
                <div className={styles.durationRow}>
                  <label className={styles.durationUnit}>
                    <span className={styles.durationUnitLabel}>h</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={Math.floor(parseNonNegativeInt(phaseMetricOverrides.placementDurationMinutes) / 60)}
                      onChange={(event) => updatePhaseDurationFromSpinner('placementDurationMinutes', 'hours', event.target.value)}
                      disabled={transitioning}
                    />
                  </label>
                  <label className={styles.durationUnit}>
                    <span className={styles.durationUnitLabel}>m</span>
                    <Input
                      type="number"
                      min="0"
                      max="55"
                      step="5"
                      value={roundToNearestFive(parseNonNegativeInt(phaseMetricOverrides.placementDurationMinutes) % 60)}
                      onChange={(event) => updatePhaseDurationFromSpinner('placementDurationMinutes', 'minutes', event.target.value)}
                      disabled={transitioning}
                    />
                  </label>
                </div>
              </div>
              <Field label="Pickup Distance (km)">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={phaseMetricOverrides.pickupDistanceKm}
                  onChange={(event) =>
                    setPhaseMetricOverrides((prev) => ({ ...prev, pickupDistanceKm: event.target.value }))
                  }
                  disabled={transitioning}
                />
              </Field>
              <div className={styles.durationField}>
                <span className="nd-field__label">Pickup Time</span>
                <div className={styles.durationRow}>
                  <label className={styles.durationUnit}>
                    <span className={styles.durationUnitLabel}>h</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={Math.floor(parseNonNegativeInt(phaseMetricOverrides.pickupDurationMinutes) / 60)}
                      onChange={(event) => updatePhaseDurationFromSpinner('pickupDurationMinutes', 'hours', event.target.value)}
                      disabled={transitioning}
                    />
                  </label>
                  <label className={styles.durationUnit}>
                    <span className={styles.durationUnitLabel}>m</span>
                    <Input
                      type="number"
                      min="0"
                      max="55"
                      step="5"
                      value={roundToNearestFive(parseNonNegativeInt(phaseMetricOverrides.pickupDurationMinutes) % 60)}
                      onChange={(event) => updatePhaseDurationFromSpinner('pickupDurationMinutes', 'minutes', event.target.value)}
                      disabled={transitioning}
                    />
                  </label>
                </div>
              </div>
            </div>

            {route.notes && (
              <div className={styles.routeNotes}>
                <strong>Notes: </strong>
                {route.notes}
              </div>
            )}

            {(() => {
              const customerInstructionEntries = sortRouteInstructionsNewestFirst(
                parseRouteInstructions(route.customerInstructions)
              );
              if (customerInstructionEntries.length === 0) return null;

              return (
                <div className={styles.routeNotes}>
                  <strong>
                    Special instructions from customer
                    {customerInstructionEntries.length > 1 ? ` (${customerInstructionEntries.length})` : ''}:
                  </strong>
                  {customerInstructionEntries.map((entry, index) => (
                    <div key={`${entry.createdAt}-${index}`} style={{ marginTop: 'var(--space-2)' }}>
                      {entry.text}
                      {(entry.agentLabel || entry.createdAt) && (
                        <div className={styles.mutedText}>
                          {entry.agentLabel ? `${entry.agentLabel} · ` : ''}
                          {entry.createdAt ? formatRouteDate(entry.createdAt) : ''}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Status transitions */}
            <div className={styles.transitionRow}>
              {route.status === 'in_progress' && (
                <span className={styles.mutedText}>{`Ending ${phaseLabelPrefix} phase using header metrics`}</span>
              )}
              {route.status === 'planned' && (
                <Button onClick={handleStartRoute} loading={transitioning} disabled={transitioning}>
                  {transitioning ? 'Starting…' : 'Start Route'}
                </Button>
              )}
              {route.status === 'in_progress' && (
                <Button
                  onClick={handleEndRoute}
                  disabled={transitioning || !canEndCurrentPhase}
                  loading={transitioning}
                >
                  {transitioning
                    ? 'Updating…'
                    : !canEndCurrentPhase
                    ? 'Action Stops First'
                    : 'End Route'}
                </Button>
              )}
              {route.status === 'signs_placed' && (
                <Button onClick={handleStartRoute} loading={transitioning} disabled={transitioning}>
                  {transitioning ? 'Starting…' : 'Start Route'}
                </Button>
              )}
              {canManagePlanning && route.status === 'signs_picked_up' && (
                <Button onClick={handleCompleteRoute} loading={transitioning} disabled={transitioning}>
                  {transitioning ? 'Completing…' : 'Complete Route'}
                </Button>
              )}
              {canManagePlanning && route.status === 'completed' && (
                <Button onClick={() => setShowArchiveConfirm(true)} loading={transitioning} disabled={transitioning}>
                  {transitioning ? 'Confirming…' : 'Confirm Completion'}
                </Button>
              )}
              {transitionError && (
                <span className={styles.transitionError}>{transitionError}</span>
              )}
            </div>

            {(route.status === 'completed' || route.status === 'archived') && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Final Route Summary</h3>
                <div className={styles.factsGrid}>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Kilometers Travelled</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${effectiveKilometersTravelled.toFixed(2)} km`}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Placement Distance</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${placementDistance.toFixed(2)} km`}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Pickup Distance</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${pickupDistance.toFixed(2)} km`}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Time Taken</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{formatElapsedMinutes(routeDurationMinutes)}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Stops</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{totalStops}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Total Number of Signs</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{totalSigns}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Customer Rate</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>
                      {customerRatePerHour === null ? '—' : formatCurrency(customerRatePerHour)} / hr
                    </span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Amount</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{formatCurrency(completionAmount)}</span>
                  </div>
                </div>

                {canManagePlanning && route.status === 'completed' && (
                  <div className={styles.distanceOverrideSection}>
                    <Field label="Kilometers Travelled" htmlFor="distanceOverrideKm">
                      <div className={styles.distanceOverrideRow}>
                        <Input
                          id="distanceOverrideKm"
                          type="number"
                          min="0"
                          step="0.01"
                          value={distanceOverrideKm}
                          onChange={(event) => setDistanceOverrideKm(event.target.value)}
                          disabled={savingDistanceOverride}
                        />
                        <Button
                          type="button"
                          size="sm"
                          loading={savingDistanceOverride}
                          onClick={() => {
                            void handleSaveDistanceOverride();
                          }}
                          disabled={savingDistanceOverride}
                        >
                          {savingDistanceOverride ? 'Saving…' : 'Save Distance'}
                        </Button>
                      </div>
                    </Field>
                    {distanceOverrideError && <div className={styles.errorBanner}>{distanceOverrideError}</div>}
                    {distanceOverrideSuccess && <div className={styles.successText}>{distanceOverrideSuccess}</div>}
                  </div>
                )}
              </div>
            )}
          </Card>
          )}

          {/* Stops Section */}
          {phaseSummary ? (
            <section role="region" aria-label="Phase summary" className={styles.phaseSummary}>
              <p className={styles.phaseSummaryKicker}>
                {phaseSummary.phase === 'pickup' ? 'Pickup' : 'Placement'} phase · Route {route.routeCode || route.id.slice(0, 8)}
              </p>
              <h1 className={styles.fieldModeTitle}>
                {phaseSummary.notAttemptedCount > 0
                  ? `Phase ended early · ${phaseSummary.doneCount} of ${phaseSummary.totalStops} stops`
                  : phaseSummary.skippedStops.length > 0
                  ? `${phaseSummary.doneCount} of ${phaseSummary.totalStops} stops done`
                  : 'Phase complete'}
              </h1>
              <p className={styles.phaseSummarySub}>
                {phaseSummary.notAttemptedCount > 0
                  ? `${phaseSummary.notAttemptedCount} stop${phaseSummary.notAttemptedCount === 1 ? '' : 's'} weren't attempted and stay open on this route.`
                  : phaseSummary.phase === 'pickup'
                  ? 'Signs are back on the van. The office invoices from these times.'
                  : "Placement is recorded. Start the pickup phase from this route when you're ready to collect signs."}
              </p>

              <div className={styles.telemetryGrid}>
                <StatTile
                  label="Stops completed"
                  value={`${phaseSummary.doneCount} / ${phaseSummary.totalStops}`}
                  icon="clipboard-list"
                />
                <StatTile
                  label={phaseSummary.phase === 'pickup' ? 'Signs collected' : 'Signs placed'}
                  value={phaseSummary.signsTotal}
                  icon="route"
                />
                <StatTile label="Distance" value={`${phaseSummary.distanceKm.toFixed(2)} km`} icon="map-pin" />
                <StatTile label="Skipped" value={phaseSummary.skippedStops.length} icon="triangle-alert" />
              </div>

              {phaseSummary.skippedStops.length > 0 && (
                <div className={styles.phaseSummarySkipPanel}>
                  <p className={styles.phaseSummarySkipHeading}>Not done</p>
                  {phaseSummary.skippedStops.map((stop) => (
                    <p key={stop.id} className={styles.phaseSummarySkipRow}>
                      <span className={styles.phaseSummarySkipSeq}>{stop.sequence ?? '-'}</span>
                      {stop.address}
                      {stop.reason ? ` — ${stop.reason}` : ''}
                    </p>
                  ))}
                </div>
              )}

              <Button size="lg" onClick={() => setShowPhaseSummary(false)}>
                Back to route
              </Button>
            </section>
          ) : isExecutionMode ? (
            <section role="region" aria-label="Operator field mode" className={styles.fieldMode}>
              <div className={styles.fieldModeHeader}>
                <div>
                  <p className={styles.fieldModeEyebrow}>{phaseLabelPrefix} phase</p>
                  <h1 className={styles.fieldModeTitle}>
                    Route {route.routeCode || route.id.slice(0, 8)}
                  </h1>
                </div>
                <div className={styles.fieldModeHeaderBadges}>
                  <Badge tone={isOnline ? 'brand' : 'neutral'} size="sm" dot>
                    {isOnline ? 'Online' : 'Offline'}
                  </Badge>
                  <RouteStatusPill status={route.status} />
                </div>
              </div>

              <div className={styles.telemetryGrid}>
                <StatTile
                  label="Vehicle location"
                  value={currentPosition ? 'Live GPS active' : 'Waiting for GPS'}
                  icon="map-pin"
                />
                <StatTile
                  label="Phase distance"
                  value={`${(currentExecutionPhase === 'pickup' ? pickupDistance : placementDistance).toFixed(2)} km`}
                  icon="route"
                />
                <StatTile
                  label="Remaining stops"
                  value={visibleStops.length}
                  icon="clipboard-list"
                />
              </div>

              <Card padded={false}>
                <div className={styles.navShell}>
                  <RouteStopsMap
                    stops={stops}
                    activeStopId={topVisibleStopId}
                    upcomingStopIds={upcomingExecutionStopIds}
                    currentPosition={currentPosition}
                    mapTheme={mapTheme}
                    presentation="field"
                  />
                  {nextExecutionStop && (
                    <div className={styles.navGlassPanel}>
                      <div className={styles.navGlassTopRow}>
                        {nextStopCounter && <span className={styles.navCounter}>{nextStopCounter}</span>}
                        <span className={styles.navPhase}>{phaseLabelPrefix.toUpperCase()}</span>
                      </div>
                      <div className={styles.navStreet}>
                        {getPrimaryAddressLine(nextExecutionStop.formattedAddress || nextExecutionStop.address)}
                      </div>
                      {getSecondaryAddressLine(nextExecutionStop.formattedAddress || nextExecutionStop.address) && (
                        <div className={styles.navSuburb}>
                          {getSecondaryAddressLine(nextExecutionStop.formattedAddress || nextExecutionStop.address)}
                        </div>
                      )}
                      <div className={styles.navFacts}>
                        <span>{nextExecutionStop.numberOfSigns ?? '-'} signs</span>
                        <span>Agent {nextExecutionStop.agent?.trim() || 'Unassigned'}</span>
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              {nextExecutionStop ? (
                <div className={styles.fieldPrimaryActions}>
                  <Button
                    size="lg"
                    block
                    onClick={() => { void handleStopCompleted(nextExecutionStop.id); }}
                    loading={!!stopExecuting[nextExecutionStop.id]}
                    disabled={!!stopExecuting[nextExecutionStop.id]}
                  >
                    {stopExecuting[nextExecutionStop.id]
                      ? 'Saving...'
                      : currentExecutionPhase === 'pickup'
                      ? 'Signs Picked Up'
                      : 'Signs Placed'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="lg"
                    block
                    onClick={() => openStopSheet(nextExecutionStop.id, 'reason')}
                    disabled={!!stopExecuting[nextExecutionStop.id]}
                  >
                    Skip Stop
                  </Button>
                </div>
              ) : (
                <p className={styles.fieldEmptyText}>
                  {currentExecutionPhase === 'pickup'
                    ? 'All pickup stops are actioned. End the route when final checks are complete.'
                    : 'All placement stops are actioned. End this phase to prepare pickup.'}
                </p>
              )}

              <div>
                <div className={styles.fieldUpcomingHeader}>
                  <span className={styles.fieldUpcomingLabel}>Then</span>
                  <span className={styles.fieldUpcomingHint}>Tap a stop to complete out of order</span>
                </div>
                {upcomingExecutionStops.length > 0 ? (
                  <ol className={styles.fieldUpcomingList}>
                    {upcomingExecutionStops.map((stop) => (
                      <li key={stop.id}>
                        <button
                          type="button"
                          className={styles.fieldUpcomingItem}
                          onClick={() => openStopSheet(stop.id)}
                        >
                          <span className={styles.fieldUpcomingSequence}>{stop.sequence ?? '-'}</span>
                          <span className={styles.fieldUpcomingAddress}>
                            {getPrimaryAddressLine(stop.formattedAddress || stop.address)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.fieldEmptyText}>No further stops in this phase.</p>
                )}
              </div>

              <div className={styles.fieldModeFooter}>
                <Button
                  onClick={handleEndRoute}
                  disabled={transitioning || !canEndCurrentPhase}
                  loading={transitioning}
                >
                  {transitioning ? 'Updating...' : !canEndCurrentPhase ? 'Action Stops First' : 'End Route'}
                </Button>
                {transitionError && (
                  <span className={styles.transitionError}>{transitionError}</span>
                )}
              </div>
            </section>
          ) : (
          <div className={styles.stopsSection}>
            <Card title="Route Map" padded={false}>
              <div className={styles.mapShell}>
                <RouteStopsMap
                  stops={stops}
                  activeStopId={topVisibleStopId}
                  currentPosition={currentPosition}
                  mapTheme={mapTheme}
                />
              </div>
            </Card>

            {canManagePlanning && !planningLocked && (
              <div className={styles.reorderHint}>Drag and drop stop cards to change sequence.</div>
            )}
            {reordering && <div className={styles.reorderStatus}>Saving updated stop order...</div>}
            {reorderError && <div className={styles.errorBanner}>{reorderError}</div>}

            {/* Add Stop Form */}
            {showAddStop && !planningLocked && (
              <Card title="Add Stop">
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
              </Card>
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

            <Card
              title={`Stops (${visibleStops.length})`}
              action={
                canManagePlanning && !planningLocked && !showAddStop ? (
                  <Button size="sm" onClick={() => setShowAddStop(true)}>
                    Add Stop
                  </Button>
                ) : undefined
              }
              padded={false}
            >
              <div className={styles.stopsList}>
                {visibleStops.map((stop, index) => {
                  if (editingStopId === stop.id) {
                    return (
                      <div key={stop.id} className={styles.editFormWrap}>
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

                  const agentName = stop.agent?.trim() || 'Unassigned';
                  const agentInitials = getAgentBadgeInitials(agentName);
                  const agentBadgeTone = getAgentBadgeTone(agentName);
                  const isTopVisibleStop = stop.id === topVisibleStopId;
                  const completedStop = isStopCompletedForPhase(stop, currentExecutionPhase);

                  const stopActions = canManagePlanning && !planningLocked ? (
                    <div className={styles.stopActionsRow}>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { void handleMoveStop(stop.id, 'up'); }}
                        disabled={index === 0 || reordering}
                      >
                        Move Up
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { void handleMoveStop(stop.id, 'down'); }}
                        disabled={index === visibleStops.length - 1 || reordering}
                      >
                        Move Down
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setEditingStopId(stop.id)}
                        disabled={reordering || !!deletingStopId}
                      >
                        Edit
                      </Button>
                      {pendingDeleteStopId === stop.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="danger"
                            loading={deletingStopId === stop.id}
                            onClick={() => { void handleDeleteStop(stop.id); }}
                            disabled={reordering || !!deletingStopId}
                          >
                            {deletingStopId === stop.id ? 'Deleting...' : 'Confirm Delete'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPendingDeleteStopId(null)}
                            disabled={reordering || !!deletingStopId}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setPendingDeleteStopId(stop.id)}
                          disabled={reordering || !!deletingStopId}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  ) : null;

                  return (
                    <StopCard
                      key={stop.id}
                      sequence={stop.sequence ?? '?'}
                      serviceType={stop.serviceType}
                      address={getPrimaryAddressLine(stop.formattedAddress || stop.address)}
                      statusLabel={getStopStatusLabel(stop, currentExecutionPhase)}
                      agentInitials={agentInitials}
                      agentName={agentName}
                      agentBadgeTone={agentBadgeTone}
                      isTop={isTopVisibleStop}
                      isCompleted={completedStop}
                      isDragging={draggingStopId === stop.id}
                      draggable={canManagePlanning && !planningLocked && !reordering}
                      onDragStart={() => setDraggingStopId(stop.id)}
                      onDragOver={(event) => {
                        if (canManagePlanning && !planningLocked) {
                          event.preventDefault();
                        }
                      }}
                      onDrop={() => { void handleDropStop(stop.id); }}
                      onDragEnd={() => setDraggingStopId(null)}
                      actions={stopActions}
                    />
                  );
                })}
              </div>
            </Card>
          </div>
          )}

          <ConfirmDialog
            open={showArchiveConfirm}
            title="Archive Route"
            message={`Archive route ${route.routeCode || route.id.slice(0, 8)}? Archived routes are no longer active.`}
            confirmLabel="Archive Route"
            tone="danger"
            busy={transitioning}
            onConfirm={() => {
              void handleConfirmCompletion();
            }}
            onCancel={() => {
              if (!transitioning) setShowArchiveConfirm(false);
            }}
          />

          <StopCompletionDialog
            stop={actionSheetStop}
            phase={currentExecutionPhase}
            busy={!!actionSheetStop && !!stopExecuting[actionSheetStop.id]}
            initialStep={actionSheetStep}
            onComplete={() => {
              if (!actionSheetStop) return;
              void handleStopCompleted(actionSheetStop.id).then((ok) => {
                if (ok) closeStopSheet();
              });
            }}
            onSkip={(reason) => {
              if (!actionSheetStop) return;
              void handleSkipStop(actionSheetStop.id, reason).then((ok) => {
                if (ok) closeStopSheet();
              });
            }}
            onClose={closeStopSheet}
          />
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
