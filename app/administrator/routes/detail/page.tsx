'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
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
import { generateAgentInitials } from '@/lib/customerDefaults';
import { geocodeAddress } from '@/lib/googleMaps';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { createStop, deleteRoute, getCustomer, getUserSettings, updateRoute, updateRouteExecution, updateStopExecution } from '@/lib/queries';
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

function StatusBadge({ status }: { status?: string | null }) {
  const badgeClass = {
    planned: styles.badgePlanned,
    in_progress: styles.badgeActive,
    signs_placed: styles.badgeActive,
    signs_picked_up: styles.badgeActive,
    completed: styles.badgeCompleted,
    archived: styles.badgeArchived,
  }[(status ?? 'planned') as string] ?? styles.badgePlanned;

  const statusLabel = {
    planned: 'planned',
    in_progress: 'in progress',
    signs_placed: 'signs placed',
    signs_picked_up: 'signs picked up',
    completed: 'completed',
    archived: 'archived',
  }[(status ?? 'planned') as string] ?? (status || 'unknown');

  return (
    <span className={`${styles.badge} ${badgeClass}`}>
      {statusLabel}
    </span>
  );
}

function formatDate(dateString?: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateString?: string | null) {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getRouteDurationMinutes(route: Route) {
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

function formatMinutesAsElapsed(minutes: number | null) {
  if (minutes === null) return '—';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) return `${remainingMinutes} min`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}m`;
}

function haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
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

function calculateRouteDistanceKm(stops: Stop[]) {
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

function formatCurrency(amount: number | null) {
  if (amount === null) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function isStopCompleted(stop: Stop) {
  return Boolean(stop.actualDepartureTime);
}

function getStopStatusLabel(stop: Stop) {
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
    durationMinutes: 0,
    ratePerHour: 0,
    amount: 0,
  });

  // Mobile execution: per-stop completion notes
  const [stopCompletionNotes, setStopCompletionNotes] = useState<Record<string, string>>({});
  const [stopCompletionPhoto, setStopCompletionPhoto] = useState<Record<string, File | null>>({});
  const [mapTheme, setMapTheme] = useState<MapTheme>('light');

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

  const handleStopArrived = useCallback(async (stopId: string) => {
    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    try {
      const arrivedAt = new Date().toISOString();
      const { errors } = await updateStopExecution(stopId, { actualArrivalTime: arrivedAt });
      if (!errors || errors.length === 0) {
        setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, actualArrivalTime: arrivedAt } : s)));
      }
    } catch { /* ignore */ }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, []);

  const handleStopCompleted = useCallback(async (stopId: string) => {
    if (!route) return;

    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    try {
      const completedAt = new Date().toISOString();
      const notes = stopCompletionNotes[stopId];
      const updatePayload: { actualDepartureTime: string; notes?: string } = { actualDepartureTime: completedAt };
      if (notes?.trim()) {
        updatePayload.notes = notes.trim();
      }
      const { errors } = await updateStopExecution(stopId, updatePayload);
      if (!errors || errors.length === 0) {
        const updatedStops = stops.map((s) =>
          s.id === stopId
            ? { ...s, actualDepartureTime: completedAt, ...(notes?.trim() ? { notes: notes.trim() } : {}) }
            : s
        );
        setStops(updatedStops);
        setStopCompletionNotes((prev) => { const n = { ...prev }; delete n[stopId]; return n; });
        setStopCompletionPhoto((prev) => { const n = { ...prev }; delete n[stopId]; return n; });

      }
    } catch { /* ignore */ }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, [route, stopCompletionNotes, stops]);

  const handleSkipStop = useCallback(async (stopId: string) => {
    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    try {
      const now = new Date().toISOString();
      const existingStop = stops.find((s) => s.id === stopId);
      const existingNotes = existingStop?.notes ?? '';
      const skippedNotes = existingNotes ? `[SKIPPED] ${existingNotes}` : '[SKIPPED]';
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
  }, [stops]);

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
      const { errors } = await updateRoute(route.id, {
        overrideSigns: billingOverrides.signs,
        overrideStops: billingOverrides.stops,
        overrideDistanceKm: billingOverrides.distanceKm,
        overrideDurationMinutes: billingOverrides.durationMinutes,
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
                overrideDurationMinutes: billingOverrides.durationMinutes,
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
  const visibleStops = (() => {
    if (!route) return stops;

    if (isPlacementPhase(route.status, route.executionPhase)) {
      return stops.filter((stop) => stop.serviceType !== 'pickup' && !isStopCompleted(stop));
    }

    if (route.status === 'signs_placed' || isPickupPhase(route.status, route.executionPhase)) {
      return stops.filter((stop) => stop.serviceType === 'pickup' && !isStopCompleted(stop));
    }

    return stops;
  })();
  const topVisibleStopId = visibleStops[0]?.id ?? null;
  const pickupStops = stops.filter((stop) => stop.serviceType === 'pickup');
  const allPickupStopsCompleted = pickupStops.every((stop) => isStopCompleted(stop));
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
    const durationMinutes = route?.overrideDurationMinutes ?? routeDurationMinutes;
    const ratePerHour = route?.overrideRate ?? customerRatePerHour;
    const amount =
      route?.overrideAmount ??
      (durationMinutes !== null && ratePerHour !== null
        ? Number(((durationMinutes / 60) * ratePerHour).toFixed(2))
        : 0);

    return {
      signs: route?.overrideSigns ?? totalSigns,
      stops: route?.overrideStops ?? totalStops,
      distanceKm: route?.overrideDistanceKm ?? kilometersTravelled,
      durationMinutes: durationMinutes ?? 0,
      ratePerHour: ratePerHour ?? 0,
      amount,
    };
  }, [
    customerRatePerHour,
    kilometersTravelled,
    route?.overrideAmount,
    route?.overrideDistanceKm,
    route?.overrideDurationMinutes,
    route?.overrideRate,
    route?.overrideSigns,
    route?.overrideStops,
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
      {/* Back link */}
      <Link href="/administrator/routes" className={styles.backLink}>
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
          <div className={styles.routeCard}>
            <div className={styles.routeCardHeader}>
              <h1 className={styles.routeTitle}>
                Route {route.routeCode || route.id.slice(0, 8)}
              </h1>
              <StatusBadge status={route.status} />
              <Link href={`/administrator/routes/edit?id=${route.id}`} className={styles.btnRouteEdit}>
                Edit Route
              </Link>
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
                <div className={styles.infoValue}>{formatDate(route.createdAt)}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>Time Taken</div>
                <div className={styles.infoValue}>{formatMinutesAsElapsed(routeDurationMinutes)}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>Kilometers</div>
                <div className={styles.infoValue}>{`${kilometersTravelled.toFixed(2)} km`}</div>
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
                  disabled={transitioning || (route.executionPhase === 'pickup' && !allPickupStopsCompleted)}
                  className={styles.btnComplete}
                >
                  {transitioning
                    ? 'Updating…'
                    : route.executionPhase === 'pickup' && !allPickupStopsCompleted
                    ? 'Awaiting Pickups'
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

            {(route.status === 'signs_picked_up' || route.status === 'completed' || route.status === 'archived') && (
              <div className={styles.summaryCard}>
                <h3 className={styles.summaryHeading}>Route Summary</h3>
                <div className={styles.summaryGrid}>
                  <div>
                    <div className={styles.infoLabel}>Kilometers Travelled</div>
                    <div className={styles.infoValue}>{`${billingDefaults.distanceKm.toFixed(2)} km`}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Time Taken</div>
                    <div className={styles.infoValue}>{formatMinutesAsElapsed(billingDefaults.durationMinutes)}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Stops</div>
                    <div className={styles.infoValue}>{billingDefaults.stops}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Total Number of Signs</div>
                    <div className={styles.infoValue}>{billingDefaults.signs}</div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Customer Rate</div>
                    <div className={styles.infoValue}>
                      {billingDefaults.ratePerHour === 0 ? '—' : formatCurrency(billingDefaults.ratePerHour)} / hr
                    </div>
                  </div>
                  <div>
                    <div className={styles.infoLabel}>Amount</div>
                    <div className={styles.infoValue}>{formatCurrency(billingDefaults.amount)}</div>
                  </div>
                </div>

                {canManagePlanning && (
                  <div className={styles.billingSection}>
                    <h4 className={styles.billingHeading}>Invoice Values</h4>
                    <div className={styles.billingGrid}>
                      <label className={styles.billingField}>
                        <span className={styles.billingLabel}>Signs</span>
                        <input
                          type="number"
                          min="0"
                          className={styles.billingInput}
                          value={billingOverrides.signs}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              signs: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.billingField}>
                        <span className={styles.billingLabel}>Stops</span>
                        <input
                          type="number"
                          min="0"
                          className={styles.billingInput}
                          value={billingOverrides.stops}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              stops: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.billingField}>
                        <span className={styles.billingLabel}>Distance (km)</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={styles.billingInput}
                          value={billingOverrides.distanceKm}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              distanceKm: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.billingField}>
                        <span className={styles.billingLabel}>Total Duration (minutes)</span>
                        <input
                          type="number"
                          min="0"
                          className={styles.billingInput}
                          value={billingOverrides.durationMinutes}
                          onChange={(event) =>
                            setBillingOverrides((current) => {
                              const durationMinutes = Number(event.target.value);
                              const amount = Number(((durationMinutes / 60) * current.ratePerHour).toFixed(2));
                              return {
                                ...current,
                                durationMinutes,
                                amount,
                              };
                            })
                          }
                        />
                      </label>
                      <label className={styles.billingField}>
                        <span className={styles.billingLabel}>Rate per Hour</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={styles.billingInput}
                          value={billingOverrides.ratePerHour}
                          onChange={(event) =>
                            setBillingOverrides((current) => {
                              const ratePerHour = Number(event.target.value);
                              const amount = Number(((current.durationMinutes / 60) * ratePerHour).toFixed(2));
                              return {
                                ...current,
                                ratePerHour,
                                amount,
                              };
                            })
                          }
                        />
                      </label>
                      <label className={styles.billingField}>
                        <span className={styles.billingLabel}>Amount</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          className={styles.billingInput}
                          value={billingOverrides.amount}
                          onChange={(event) =>
                            setBillingOverrides((current) => ({
                              ...current,
                              amount: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className={styles.billingActions}>
                      <button
                        type="button"
                        className={styles.btnSaveBilling}
                        onClick={handleSaveBillingOverrides}
                        disabled={savingBillingOverrides}
                      >
                        {savingBillingOverrides ? 'Saving…' : 'Save Invoice Values'}
                      </button>
                      <div className={styles.billingMeta}>
                        Default amount from duration and rate: {formatCurrency(billingDefaults.amount)}
                      </div>
                    </div>
                    {billingOverrideError && <div className={styles.errorBanner}>{billingOverrideError}</div>}
                    {billingOverrideSuccess && <div className={styles.billingSuccess}>{billingOverrideSuccess}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stops Section */}
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

            <div className={styles.mapSection}>
              <h3 className={styles.mapHeading}>Route Map</h3>
              <RouteStopsMap stops={stops} activeStopId={topVisibleStopId} mapTheme={mapTheme} />
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
                  : 'All pickup stops are complete. Click End Route to finish pickup phase.'}
              </div>
            )}

            {stops.length === 0 && !showAddStop && (
              <div className={styles.emptyState}>
                No stops yet. Click &quot;Add Stop&quot; to add the first one.
              </div>
            )}

            <div className={styles.stopsList}>
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
                const isTopVisibleStop = stop.id === topVisibleStopId;
                const completedStop = isStopCompleted(stop);
                return (
                  <div
                    key={stop.id}
                    className={`${styles.stopCard} ${stopCardClass} ${isTopVisibleStop ? styles.stopCardTop : ''} ${completedStop ? styles.stopCardCompleted : ''} ${draggingStopId === stop.id ? styles.stopCardDragging : ''}`}
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
                    {/* Sequence circle */}
                    <div className={`${styles.circle} ${stopCircleClass}`}>
                      {stop.sequence ?? '?'}
                    </div>

                    {/* Details */}
                    <div>
                      <div className={styles.stopAddress}>
                        {stop.formattedAddress || stop.address}
                      </div>
                      <div className={styles.stopStatus}>{getStopStatusLabel(stop)}</div>
                      {stop.agent && (
                        <div className={styles.stopAgentBadge}>
                          <span className={styles.stopAgentInitials}>
                            {generateAgentInitials(stop.agent) ?? stop.agent.slice(0, 2).toUpperCase()}
                          </span>
                          <span>{stop.agent}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {canManagePlanning && !planningLocked && (
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

                    {/* Execution actions — visible to all operators when route is active */}
                    {route?.status === 'in_progress' && (
                      <div className={styles.stopExecution}>
                        {!stop.actualArrivalTime && (
                          <div className={styles.execActionRow}>
                            <button
                              onClick={() => { void handleStopArrived(stop.id); }}
                              className={styles.btnArrived}
                              disabled={!!stopExecuting[stop.id]}
                            >
                              {stopExecuting[stop.id] ? 'Saving…' : '📍 Arrived'}
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
                        {stop.actualArrivalTime && !stop.actualDepartureTime && (
                          <div className={styles.execCompletionPanel}>
                            <span className={styles.execTimestamp}>
                              ✓ Arrived: {formatDateTime(stop.actualArrivalTime)}
                            </span>
                            <textarea
                              className={styles.execNotesInput}
                              placeholder="Add completion notes (optional)…"
                              rows={2}
                              value={stopCompletionNotes[stop.id] ?? ''}
                              onChange={(e) =>
                                setStopCompletionNotes((prev) => ({ ...prev, [stop.id]: e.target.value }))
                              }
                            />
                            <label className={styles.execPhotoLabel}>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className={styles.execPhotoInput}
                                onChange={(e) => {
                                  const file = e.target.files?.[0] ?? null;
                                  setStopCompletionPhoto((prev) => ({ ...prev, [stop.id]: file }));
                                }}
                              />
                              {stopCompletionPhoto[stop.id]
                                ? `📷 ${stopCompletionPhoto[stop.id]!.name}`
                                : '📷 Attach Photo (optional)'}
                            </label>
                            <button
                              onClick={() => { void handleStopCompleted(stop.id); }}
                              className={styles.btnExecComplete}
                              disabled={!!stopExecuting[stop.id]}
                            >
                              {stopExecuting[stop.id]
                                ? 'Saving…'
                                : stop.serviceType === 'pickup'
                                ? '✓ Collected Signs'
                                : '✓ Placed Signs'}
                            </button>
                          </div>
                        )}
                        {stop.actualArrivalTime && stop.actualDepartureTime && (
                          <div className={styles.execDone}>
                            {stop.notes?.startsWith('[SKIPPED]') ? (
                              <span className={styles.execSkippedBadge}>⏭ Skipped</span>
                            ) : (
                              <>
                                <span>✓ Arrived: {formatDateTime(stop.actualArrivalTime)}</span>
                                <span>
                                  ✓ {stop.serviceType === 'pickup' ? 'Collected' : 'Placed'}:{' '}
                                  {formatDateTime(stop.actualDepartureTime)}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}                  </div>                );
              })}
            </div>
          </div>
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
