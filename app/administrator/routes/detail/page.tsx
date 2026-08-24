'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import { StopForm } from '@/app/operator/components/StopForm';
import StopCard from '@/app/administrator/components/StopCard';
import { RouteStatusPill } from '@/app/administrator/components/RouteStatusPill';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
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
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { createStop, deleteRoute, getCustomer, getRouteWithStops, getUserSettings, updateRoute, updateRouteExecution, updateStopExecution } from '@/lib/queries';
import { deleteStop } from '@/lib/queries/DeleteStop';
import { updateStop } from '@/lib/queries/UpdateStop';
import type { Route, Stop } from '@/amplify/types';
import type { MapTheme } from '@/lib/mapThemes';
import styles from './page.module.css';

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

const DEFAULT_SIGNS_COLLECTED_MINUTES = 15;
const DEFAULT_SIGNS_RETURNED_MINUTES = 15;

type ExecutionPhase = 'placement' | 'pickup';

const PLACEMENT_DONE_MARKER = 'PLACEMENT_DONE';
const PICKUP_DONE_MARKER = 'PICKUP_DONE';
const PLACEMENT_SKIPPED_MARKER = 'PLACEMENT_SKIPPED';
const PICKUP_SKIPPED_MARKER = 'PICKUP_SKIPPED';

function phaseMinutes(start?: string | null, end?: string | null) {
  if (!start || !end) return null;
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function deriveDurationBuckets(route: Route | null, durationTotalMinutes: number) {
  const signsCollectedMinutes = DEFAULT_SIGNS_COLLECTED_MINUTES;
  const signsReturnedMinutes = DEFAULT_SIGNS_RETURNED_MINUTES;
  const distributable = Math.max(0, durationTotalMinutes - signsCollectedMinutes - signsReturnedMinutes);

  const signsPlacedFromRoute = phaseMinutes(route?.placementStartTime, route?.placementEndTime);
  const signsPickedUpFromRoute = phaseMinutes(route?.pickupStartTime, route?.pickupEndTime);

  let signsPlacedMinutes: number;
  let signsPickedUpMinutes: number;

  if (signsPlacedFromRoute !== null || signsPickedUpFromRoute !== null) {
    signsPlacedMinutes = signsPlacedFromRoute ?? Math.max(0, distributable - (signsPickedUpFromRoute ?? 0));
    signsPickedUpMinutes = signsPickedUpFromRoute ?? Math.max(0, distributable - signsPlacedMinutes);
  } else {
    signsPlacedMinutes = Math.ceil(distributable / 2);
    signsPickedUpMinutes = Math.max(0, distributable - signsPlacedMinutes);
  }

  return {
    signsCollectedMinutes,
    signsPlacedMinutes,
    signsPickedUpMinutes,
    signsReturnedMinutes,
  };
}

function getDurationTotalMinutes(values: {
  signsCollectedMinutes: number;
  signsPlacedMinutes: number;
  signsPickedUpMinutes: number;
  signsReturnedMinutes: number;
}) {
  return (
    Math.max(0, values.signsCollectedMinutes) +
    Math.max(0, values.signsPlacedMinutes) +
    Math.max(0, values.signsPickedUpMinutes) +
    Math.max(0, values.signsReturnedMinutes)
  );
}

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

function isStopCompleted(stop: Stop) {
  return Boolean(stop.actualDepartureTime);
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

function isPlacementPhase(status?: string | null, executionPhase?: string | null) {
  return status === 'in_progress' && executionPhase === 'placement';
}

function isPickupPhase(status?: string | null, executionPhase?: string | null) {
  return status === 'in_progress' && executionPhase === 'pickup';
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
  const [savingBillingOverrides, setSavingBillingOverrides] = useState(false);
  const [billingOverrideError, setBillingOverrideError] = useState<string | null>(null);
  const [billingOverrideSuccess, setBillingOverrideSuccess] = useState<string | null>(null);
  const [billingOverrides, setBillingOverrides] = useState({
    signs: 0,
    stops: 0,
    distanceKm: 0,
    signsCollectedMinutes: DEFAULT_SIGNS_COLLECTED_MINUTES,
    signsPlacedMinutes: 0,
    signsPickedUpMinutes: 0,
    signsReturnedMinutes: DEFAULT_SIGNS_RETURNED_MINUTES,
    ratePerHour: 0,
    amount: 0,
  });

  const [mapTheme, setMapTheme] = useState<MapTheme>('light');

  const fetchStops = useCallback(async () => {
    const { stops: allStops, errors } = await getRouteWithStops(id);
    if (!errors || errors.length === 0) {
      setStops(allStops as Stop[]);
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
        // Non-blocking: map defaults to light.
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

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
          }
        : {
            status: 'in_progress',
            executionPhase: 'pickup',
            pickupStartTime: startedAt,
          });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to start route.');
      } else {
        setRoute((r) =>
          r
            ? {
                ...r,
                status: 'in_progress',
                executionPhase: isStartingPlacement ? 'placement' : 'pickup',
                actualStartTime: isStartingPlacement ? (r.actualStartTime ?? startedAt) : r.actualStartTime,
                placementStartTime: isStartingPlacement ? startedAt : r.placementStartTime,
                pickupStartTime: isStartingPickup ? startedAt : r.pickupStartTime,
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
      const startForDuration = route.actualStartTime
        ?? route.placementStartTime
        ?? route.pickupStartTime
        ?? endedAt;
      const actualDurationMinutes = Math.max(
        0,
        Math.round((now.getTime() - new Date(startForDuration).getTime()) / 60000)
      );

      const { errors } = await updateRouteExecution(route.id, isEndingPlacement
        ? {
            status: 'signs_placed',
            executionPhase: 'placement',
            placementEndTime: endedAt,
          }
        : {
            status: 'signs_picked_up',
            executionPhase: 'pickup',
            pickupEndTime: endedAt,
            actualEndTime: endedAt,
            actualDurationMinutes,
          });

      if (errors && errors.length > 0) {
        setTransitionError('Failed to end route phase.');
      } else {
        setRoute((r) =>
          r
            ? {
                ...r,
                status: isEndingPlacement ? 'signs_placed' : 'signs_picked_up',
                executionPhase: route.executionPhase,
                placementEndTime: isEndingPlacement ? endedAt : r.placementEndTime,
                pickupEndTime: isEndingPlacement ? r.pickupEndTime : endedAt,
                actualEndTime: isEndingPlacement ? r.actualEndTime : endedAt,
                actualDurationMinutes: isEndingPlacement ? r.actualDurationMinutes : actualDurationMinutes,
              }
            : r
        );
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

  const handleSaveBillingOverrides = async () => {
    if (!route || !canManagePlanning) return;

    setSavingBillingOverrides(true);
    setBillingOverrideError(null);
    setBillingOverrideSuccess(null);

    try {
      const overrideDurationMinutes = getDurationTotalMinutes(billingOverrides);
      const { errors } = await updateRoute(route.id, {
        overrideSigns: billingOverrides.signs,
        overrideStops: billingOverrides.stops,
        overrideDistanceKm: billingOverrides.distanceKm,
        overrideDurationMinutes,
        overrideRate: billingOverrides.ratePerHour,
        overrideAmount: billingOverrides.amount,
      });

      if (errors && errors.length > 0) {
        setBillingOverrideError('Failed to save invoice values.');
      } else {
        setRoute((current) =>
          current
            ? {
                ...current,
                overrideSigns: billingOverrides.signs,
                overrideStops: billingOverrides.stops,
                overrideDistanceKm: billingOverrides.distanceKm,
                overrideDurationMinutes,
                overrideRate: billingOverrides.ratePerHour,
                overrideAmount: billingOverrides.amount,
              }
            : current
        );
        setBillingOverrideSuccess('Invoice values saved.');
      }
    } catch {
      setBillingOverrideError('Failed to save invoice values.');
    }

    setSavingBillingOverrides(false);
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

    router.push('/administrator/routes');
  };

  const planningLocked = route?.status !== 'planned';
  const currentExecutionPhase: ExecutionPhase = route?.executionPhase === 'pickup' ? 'pickup' : 'placement';
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
  const currentPhaseStopIds = new Set(visibleStops.map((stop) => stop.id));
  const topVisibleStopId = visibleStops[0]?.id ?? null;
  const allPickupStopsCompleted =
    pickupPhaseStops.length === 0 || pickupPhaseStops.every((stop) => isStopCompletedForPhase(stop, 'pickup'));
  const completedStops = stops.filter((stop) => isStopCompleted(stop));
  const summaryStops = route?.status === 'completed' || route?.status === 'archived'
    ? completedStops.length > 0
      ? completedStops
      : stops
    : stops;
  const routeDurationMinutes = route ? getRouteDurationMinutes(route) : null;
  const kilometersTravelled = calculateRouteDistanceKm(summaryStops);
  const totalStops = summaryStops.length;
  const totalSigns = summaryStops.reduce(
    (sum, stop) => sum + (typeof stop.numberOfSigns === 'number' ? stop.numberOfSigns : 0),
    0
  );
  const billingDefaults = useMemo(() => {
    const durationMinutes = route?.overrideDurationMinutes ?? routeDurationMinutes ?? 0;
    const durationBuckets = deriveDurationBuckets(route, durationMinutes);
    const totalDurationMinutes = getDurationTotalMinutes(durationBuckets);
    const ratePerHour = route?.overrideRate ?? customerRatePerHour;
    const amount =
      route?.overrideAmount ??
      (ratePerHour !== null
        ? Number(((totalDurationMinutes / 60) * ratePerHour).toFixed(2))
        : 0);

    return {
      signs: route?.overrideSigns ?? totalSigns,
      stops: route?.overrideStops ?? totalStops,
      distanceKm: route?.overrideDistanceKm ?? kilometersTravelled,
      ...durationBuckets,
      durationMinutes: totalDurationMinutes,
      ratePerHour: ratePerHour ?? 0,
      amount,
    };
  }, [
    customerRatePerHour,
    kilometersTravelled,
    route,
    routeDurationMinutes,
    totalSigns,
    totalStops,
  ]);

  useEffect(() => {
    if (!route) return;
    setBillingOverrides(billingDefaults);
    setBillingOverrideError(null);
    setBillingOverrideSuccess(null);
  }, [billingDefaults, route]);

  const availableAgentsForStops = useMemo(() => {
    const customerAgents = customerDefaults?.agentOptions ?? [];
    const routeAgents = stops
      .map((stop) => stop.agent?.trim())
      .filter((agent): agent is string => Boolean(agent));

    return Array.from(new Set([...customerAgents, ...routeAgents]));
  }, [customerDefaults?.agentOptions, stops]);
  const defaultAgentForStops = customerDefaults?.defaultAgentName ?? availableAgentsForStops[0] ?? undefined;

  if (loading) return <LoadingSpinner message="Loading route..." />;

  return (
    <div className={styles.container}>
      <Breadcrumbs
        items={[
          { label: 'Routes', href: '/administrator/routes' },
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
          <Card>
            <div className={styles.routeCardHeader}>
              <h1 className={styles.routeTitle}>
                Route {route.routeCode || route.id.slice(0, 8)}
              </h1>
              <RouteStatusPill status={route.status} />
              <div className={styles.headerActions}>
                <a href={`/administrator/routes/edit?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
                  Edit Route
                </a>
                {canManagePlanning && (
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
                )}
              </div>
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
                <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${kilometersTravelled.toFixed(2)} km`}</span>
              </div>
              <div className="nd-stat">
                <span className="nd-stat__label">Assigned Operator</span>
                <span className="nd-stat__value" style={{ fontSize: 16 }}>{route.assignedOperatorName || 'Unassigned'}</span>
              </div>
            </div>

            {route.notes && (
              <div className={styles.routeNotes}>
                <strong>Notes: </strong>
                {route.notes}
              </div>
            )}

            {/* Status transitions */}
            <div className={styles.transitionRow}>
              {route.status === 'planned' && (
                <Button onClick={handleStartRoute} loading={transitioning} disabled={transitioning}>
                  {transitioning ? 'Starting…' : 'Start Route'}
                </Button>
              )}
              {route.status === 'in_progress' && (
                <Button
                  onClick={handleEndRoute}
                  disabled={transitioning || (route.executionPhase === 'pickup' && !allPickupStopsCompleted)}
                  loading={transitioning}
                >
                  {transitioning
                    ? 'Updating…'
                    : route.executionPhase === 'pickup' && !allPickupStopsCompleted
                    ? 'Awaiting Pickups'
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
                <Button onClick={handleConfirmCompletion} loading={transitioning} disabled={transitioning}>
                  {transitioning ? 'Confirming…' : 'Confirm Completion'}
                </Button>
              )}
              {transitionError && (
                <span className={styles.transitionError}>{transitionError}</span>
              )}
            </div>

            {(route.status === 'signs_picked_up' || route.status === 'completed' || route.status === 'archived') && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Route Summary</h3>
                <div className={styles.factsGrid}>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Kilometers Travelled</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${billingDefaults.distanceKm.toFixed(2)} km`}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Time Taken</span>
                    <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{formatElapsedMinutes(billingDefaults.durationMinutes)}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Stops</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{billingDefaults.stops}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Total Number of Signs</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{billingDefaults.signs}</span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Customer Rate</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>
                      {billingDefaults.ratePerHour === 0 ? '—' : formatCurrency(billingDefaults.ratePerHour)} / hr
                    </span>
                  </div>
                  <div className="nd-stat">
                    <span className="nd-stat__label">Amount</span>
                    <span className="nd-stat__value" style={{ fontSize: 16 }}>{formatCurrency(billingDefaults.amount)}</span>
                  </div>
                </div>

                {canManagePlanning && (
                  <div className={styles.billingSection}>
                    <h4 className={styles.billingHeading}>Invoice Values</h4>
                    <div className={styles.billingGrid}>
                      <Field label="Signs">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signs}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              signs: Number(event.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field label="Stops">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.stops}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              stops: Number(event.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field label="Distance (km)">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={billingOverrides.distanceKm}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              distanceKm: Number(event.target.value),
                            }))
                          }
                        />
                      </Field>
                      <Field label="Signs Collected (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsCollectedMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => {
                              const signsCollectedMinutes = Number(event.target.value);
                              const amount = Number(
                                ((
                                  getDurationTotalMinutes({
                                    ...current,
                                    signsCollectedMinutes,
                                  }) / 60
                                ) * current.ratePerHour).toFixed(2)
                              );
                              return {
                                ...current,
                                signsCollectedMinutes,
                                amount,
                              };
                            })
                          }
                        />
                      </Field>
                      <Field label="Signs Placed (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsPlacedMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => {
                              const signsPlacedMinutes = Number(event.target.value);
                              const amount = Number(
                                ((
                                  getDurationTotalMinutes({
                                    ...current,
                                    signsPlacedMinutes,
                                  }) / 60
                                ) * current.ratePerHour).toFixed(2)
                              );
                              return {
                                ...current,
                                signsPlacedMinutes,
                                amount,
                              };
                            })
                          }
                        />
                      </Field>
                      <Field label="Signs Picked Up (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsPickedUpMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => {
                              const signsPickedUpMinutes = Number(event.target.value);
                              const amount = Number(
                                ((
                                  getDurationTotalMinutes({
                                    ...current,
                                    signsPickedUpMinutes,
                                  }) / 60
                                ) * current.ratePerHour).toFixed(2)
                              );
                              return {
                                ...current,
                                signsPickedUpMinutes,
                                amount,
                              };
                            })
                          }
                        />
                      </Field>
                      <Field label="Signs Returned (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={billingOverrides.signsReturnedMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => {
                              const signsReturnedMinutes = Number(event.target.value);
                              const amount = Number(
                                ((
                                  getDurationTotalMinutes({
                                    ...current,
                                    signsReturnedMinutes,
                                  }) / 60
                                ) * current.ratePerHour).toFixed(2)
                              );
                              return {
                                ...current,
                                signsReturnedMinutes,
                                amount,
                              };
                            })
                          }
                        />
                      </Field>
                      <Field label="Total Duration (minutes)">
                        <Input
                          type="number"
                          min="0"
                          value={getDurationTotalMinutes(billingOverrides)}
                          readOnly
                        />
                      </Field>
                      <Field label="Rate per Hour">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={billingOverrides.ratePerHour}
                          onChange={(event) =>
                            setBillingOverrides((current) => {
                              const ratePerHour = Number(event.target.value);
                              const amount = Number(((getDurationTotalMinutes(current) / 60) * ratePerHour).toFixed(2));
                              return {
                                ...current,
                                ratePerHour,
                                amount,
                              };
                            })
                          }
                        />
                      </Field>
                      <Field label="Amount">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={billingOverrides.amount}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              amount: Number(event.target.value),
                            }))
                          }
                        />
                      </Field>
                    </div>

                    <div className={styles.billingActions}>
                      <Button
                        type="button"
                        loading={savingBillingOverrides}
                        disabled={savingBillingOverrides}
                        onClick={handleSaveBillingOverrides}
                      >
                        {savingBillingOverrides ? 'Saving…' : 'Save Invoice Values'}
                      </Button>
                      <div className={styles.billingMeta}>
                        Default amount from duration and rate: {formatCurrency(billingDefaults.amount)}
                      </div>
                    </div>
                    {billingOverrideError && <div className={styles.errorBanner}>{billingOverrideError}</div>}
                    {billingOverrideSuccess && <div className={styles.successText}>{billingOverrideSuccess}</div>}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Stops Section */}
          <div className={styles.stopsSection}>
            <Card title="Route Map" padded={false}>
              <div className={styles.mapShell}>
                <RouteStopsMap stops={stops} activeStopId={topVisibleStopId} mapTheme={mapTheme} />
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
              title={`Stops (${stops.length})${visibleStops.length !== stops.length ? ` - In Current Phase: ${visibleStops.length}` : ''}`}
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
                {stops.map((stop, index) => {
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

                  const isTopVisibleStop = stop.id === topVisibleStopId;
                  const isCurrentPhaseStop = currentPhaseStopIds.has(stop.id);
                  const completedStop = isStopCompleted(stop);
                  const phaseComplete = isStopCompletedForPhase(stop, currentExecutionPhase);
                  const phaseSkipped = isStopSkippedForPhase(stop, currentExecutionPhase);
                  const phaseCompletedAt = getPhaseCompletionTime(stop, currentExecutionPhase) ?? stop.actualDepartureTime;
                  const agentName = stop.agent?.trim() || 'Unassigned';
                  const agentInitials = getAgentBadgeInitials(agentName);
                  const agentBadgeTone = getAgentBadgeTone(agentName);

                  let stopActions: React.ReactNode = null;
                  if (canManagePlanning && !planningLocked) {
                    stopActions = (
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
                          disabled={index === stops.length - 1 || reordering}
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
                    );
                  } else if (route?.status === 'in_progress' && isCurrentPhaseStop) {
                    stopActions = !phaseComplete ? (
                      <div className={styles.execActionRow}>
                        <Button
                          size="sm"
                          onClick={() => { void handleStopCompleted(stop.id); }}
                          disabled={!!stopExecuting[stop.id]}
                        >
                          {stopExecuting[stop.id]
                            ? 'Saving…'
                            : route.executionPhase === 'pickup'
                            ? 'Signs Picked Up'
                            : 'Signs Placed'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { void handleSkipStop(stop.id); }}
                          disabled={!!stopExecuting[stop.id]}
                        >
                          Skip Stop
                        </Button>
                      </div>
                    ) : (
                      <div className={styles.execDone}>
                        {phaseSkipped ? (
                          <span className={styles.execSkippedBadge}>⏭ Skipped</span>
                        ) : (
                          <span>
                            ✓ {currentExecutionPhase === 'pickup' ? 'Collected' : 'Placed'}:{' '}
                            {formatRouteDateTime(phaseCompletedAt)}
                          </span>
                        )}
                      </div>
                    );
                  }

                  return (
                    <StopCard
                      key={stop.id}
                      sequence={stop.sequence ?? '?'}
                      serviceType={stop.serviceType}
                      address={stop.formattedAddress || stop.address || ''}
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
        </>
      )}
    </div>
  );
}

export default function RouteDetailPage() {
  return (
    <OperatorRoute requireAdmin>
      <Suspense fallback={<LoadingSpinner message="Loading route..." />}>
        <RouteDetailContent />
      </Suspense>
    </OperatorRoute>
  );
}
