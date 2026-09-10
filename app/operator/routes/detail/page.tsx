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
import ConfirmDialog from '@/app/components/ConfirmDialog';
import { StopForm } from '@/app/operator/components/StopForm';
import StopCard from '@/app/operator/components/StopCard';
import { RouteStatusPill } from '@/app/operator/components/RouteStatusPill';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { isAdmin } from '@/lib/amplify-config';
import { getAgentBadgeInitials, getAgentBadgeTone } from '@/lib/customerDefaults';
import { geocodeAddress } from '@/lib/googleMaps';
import {
  calculateRouteDistanceKm,
  formatCurrency,
  formatElapsedMinutes,
  formatRouteDate,
  getPrimaryAddressLine,
  getRouteDurationMinutes,
} from '@/lib/routeDetailHelpers';
import {
  getMarkerReason,
  isStopCompletedForPhase,
  isStopSkippedForPhase,
  PICKUP_SKIPPED_MARKER,
  PLACEMENT_SKIPPED_MARKER,
  type ExecutionPhase,
} from '@/lib/stopExecutionMarkers';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import {
  createStop,
  deleteRoute,
  getCustomer,
  getUserSettings,
  updateRoute,
} from '@/lib/queries';
import type { MapTheme } from '@/lib/mapThemes';
import { MAP_THEMES } from '@/lib/mapThemes';
import { deleteStop } from '@/lib/queries/DeleteStop';
import { updateStop } from '@/lib/queries/UpdateStop';
import { PhaseTrackBar } from '@/app/operator/components/PhaseTrackBar';
import { getSignRunPhase, ROUTE_PHASE_KEYS, ROUTE_PHASE_LABELS } from '@/lib/signRunPhase';
import type { Route, Stop } from '@/amplify/types';
import { parseRouteInstructions, sortRouteInstructionsNewestFirst } from '@/lib/routeInstructions';
import styles from './page.module.css';

const PHASE_SCREEN_HREF: Record<number, string> = {
  0: 'load',
  1: 'placement',
  2: 'pickup',
  3: 'unload',
  4: 'finalise',
};

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

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
    defaultAgentInitials?: string | null;
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

  const [deletingRoute, setDeletingRoute] = useState(false);
  const [routePendingDelete, setRoutePendingDelete] = useState(false);
  const [distanceOverrideKm, setDistanceOverrideKm] = useState('');
  const [savingDistanceOverride, setSavingDistanceOverride] = useState(false);
  const [distanceOverrideError, setDistanceOverrideError] = useState<string | null>(null);
  const [distanceOverrideSuccess, setDistanceOverrideSuccess] = useState<string | null>(null);

  const [phaseDistanceKm, setPhaseDistanceKm] = useState({
    signs_placed: 0,
    signs_picked_up: 0,
  });
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
            defaultAgentInitials?: string | null;
            agentOptions?: string[] | null;
          } | null;
          setCustomerName(customer?.name || 'Unknown customer');
          setCustomerRatePerHour(typeof customer?.billingRatePerHour === 'number' ? customer.billingRatePerHour : null);
          setCustomerDefaults({
            standingInstructions: customer?.standingInstructions ?? null,
            defaultNumberOfSigns: customer?.defaultNumberOfSigns ?? null,
            defaultAgentInitials: customer?.defaultAgentInitials ?? null,
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
        // The address field wasn't (re)resolved via autocomplete on this save — the
        // common case when only another field changed. Reuse the stop's existing
        // coordinates instead of re-geocoding, so an unchanged address can't fail
        // the whole save on a flaky Maps API call (mirrors the fix for #58).
        const originalStop = stops.find((s) => s.id === editingStopId);
        const addressUnchanged = originalStop?.address?.trim() === values.address.trim();
        if (
          addressUnchanged &&
          typeof originalStop?.latitude === 'number' &&
          typeof originalStop?.longitude === 'number'
        ) {
          lat = originalStop.latitude;
          lng = originalStop.longitude;
          formatted = originalStop.formattedAddress ?? formatted;
        } else {
          const geocoded = await geocodeAddress(values.address);
          lat = geocoded.latitude;
          lng = geocoded.longitude;
          formatted = geocoded.formattedAddress;
        }
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
        const firstError = result.errors[0] as { message?: string } | undefined;
        setEditStopError(firstError?.message ?? 'Failed to update stop.');
      } else {
        setEditingStopId(null);
        await fetchStops();
      }
    } catch (error) {
      setEditStopError(error instanceof Error ? error.message : 'Failed to update stop.');
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

    setDeletingRoute(true);
    setError(null);

    const result = await deleteRoute(route.id);
    if (result.errors && result.errors.length > 0) {
      setError('Failed to delete route.');
      setDeletingRoute(false);
      setRoutePendingDelete(false);
      return;
    }

    router.push('/operator/routes');
  };

  const planningLocked = route?.status !== 'planned';
  const currentExecutionPhase = route?.executionPhase === 'pickup' ? 'pickup' : 'placement';
  const pickupPhaseStops = stops.filter((stop) => stop.serviceType !== 'inspection');
  const visibleStops = (() => {
    if (!route) return stops;

    if (route.status === 'signs_placed') {
      return pickupPhaseStops.filter((stop) => !isStopCompletedForPhase(stop, 'pickup'));
    }

    return stops;
  })();
  const topVisibleStopId = visibleStops[0]?.id ?? null;
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
  const defaultAgentForStops = customerDefaults?.defaultAgentInitials ?? availableAgentsForStops[0] ?? undefined;
  const placementDistance = phaseDistanceKm.signs_placed;
  const pickupDistance = phaseDistanceKm.signs_picked_up;

  // Read-only phase overview — advancing a route through its phases is now
  // exclusively done from the Load/Placement/Pickup/Unload/Finalise screens,
  // so this links there rather than offering a transition button.
  // Completed/archived routes always render as fully done — archived is a
  // legacy status and no longer gets its own presentation (see
  // lib/signRunPhase.ts).
  const phaseOverview = (() => {
    if (!route) return null;
    if (route.status === 'completed' || route.status === 'archived') {
      return { track: ['done', 'done', 'done', 'done', 'done', 'done'] as const, caption: ROUTE_PHASE_LABELS.completed, href: null as string | null };
    }
    const info = getSignRunPhase(route, stops.length);
    if (!info) return null;
    const currentIdx = info.overallTrack.indexOf('current');
    const idx = currentIdx === -1 ? info.overallTrack.length - 1 : currentIdx;
    const screen = PHASE_SCREEN_HREF[info.phaseIdx];
    return {
      track: info.overallTrack,
      caption: `${ROUTE_PHASE_LABELS[ROUTE_PHASE_KEYS[idx]]} · Phase ${idx + 1} of 6`,
      href: screen ? `/operator/routes/${screen}?id=${route.id}` : null,
    };
  })();

  useEffect(() => {
    if (!route) return;
    const initialDistance = route.overrideDistanceKm ?? kilometersTravelled;
    setDistanceOverrideKm(initialDistance.toFixed(2));
    setDistanceOverrideError(null);
    setDistanceOverrideSuccess(null);
  }, [kilometersTravelled, route]);

  // In-progress routes now run exclusively through the dedicated Load/
  // Placement/Pickup/Unload/Finalise screens — operator field mode on this
  // page is retired. Send the operator to the right phase screen instead of
  // ever rendering the legacy in-page execution UI.
  useEffect(() => {
    if (!route || route.status !== 'in_progress') return;
    const info = getSignRunPhase(route, stops.length);
    const screen = info ? PHASE_SCREEN_HREF[info.phaseIdx] : undefined;
    router.replace(screen ? `/operator/routes/${screen}?id=${route.id}` : '/operator/routes');
  }, [route, stops.length, router]);

  if (loading) return <LoadingSpinner message="Loading route..." />;
  if (route?.status === 'in_progress') {
    return <LoadingSpinner message="Redirecting to the active phase screen..." />;
  }

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
          <Card>
            <div className={styles.routeCardHeader}>
              <h1 className={styles.routeTitle}>
                Route {route.routeCode || route.id.slice(0, 8)}
              </h1>
              <RouteStatusPill route={route} />
              {canManagePlanning && (
                <div className={styles.headerActions}>
                  <a href={`/administrator/routes/edit?id=${route.id}`} className="nd-btn nd-btn--secondary nd-btn--sm">
                    Edit Route
                  </a>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={deletingRoute}
                    onClick={() => setRoutePendingDelete(true)}
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
                <span className="nd-stat__label">{route.status === 'planned' ? 'Estimated Kilometers' : 'Kilometers'}</span>
                <span className="nd-stat__value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>{`${effectiveKilometersTravelled.toFixed(2)} km`}</span>
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

            {/* Route phase — read-only. Advancing a route through its phases is an
                operator action on the Load/Placement/Pickup/Unload/Finalise screens. */}
            {phaseOverview && (
              <div className={styles.summaryPanel}>
                <h3 className={styles.summaryHeading}>Route Phase</h3>
                <PhaseTrackBar track={[...phaseOverview.track]} caption={phaseOverview.caption} />
                {phaseOverview.href && (
                  <a
                    href={phaseOverview.href}
                    className="nd-btn nd-btn--primary nd-btn--sm"
                    style={{ marginTop: 'var(--space-3)' }}
                  >
                    Continue route →
                  </a>
                )}
              </div>
            )}

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

          {/* Stops Section */}
          <div className={styles.stopsSection}>
            <Card title="Route Map" padded={false}>
              <div className={styles.mapShell}>
                <RouteStopsMap
                  stops={stops}
                  activeStopId={topVisibleStopId}
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
                  defaultAgentInitials={defaultAgentForStops}
                  availableAgents={availableAgentsForStops}
                  isSubmitting={addingStop}
                  error={addStopError}
                  submitLabel="Add Stop"
                />
              </Card>
            )}

            {visibleStops.length === 0 && !showAddStop && route?.status === 'signs_placed' && (
              <div className={styles.emptyState}>
                Ready for pickup phase. Continue from the route phase panel above.
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
                          defaultAgentInitials={defaultAgentForStops}
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
        </>
      )}

      <ConfirmDialog
        open={routePendingDelete}
        title="Delete route?"
        message={`Delete route ${route?.routeCode || route?.id.slice(0, 8)}? This will also delete all stops on the route.`}
        confirmLabel="Delete"
        tone="danger"
        busy={deletingRoute}
        onConfirm={() => void handleDeleteRoute()}
        onCancel={() => {
          if (!deletingRoute) setRoutePendingDelete(false);
        }}
      />
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
