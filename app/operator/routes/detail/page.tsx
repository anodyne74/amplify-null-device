'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
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
import { createStop, deleteRoute, getCustomer, updateRouteExecution, updateStopExecution } from '@/lib/queries';
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
  const badgeClass = {
    planned: styles.badgePlanned,
    signs_placed: styles.badgeActive,
    signs_picked_up: styles.badgeActive,
    completed: styles.badgeCompleted,
    archived: styles.badgeArchived,
  }[(status ?? 'planned') as string] ?? styles.badgePlanned;

  const statusLabel = {
    planned: 'planned',
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

function formatRouteDuration(route: Route) {
  if (typeof route.actualDurationMinutes === 'number') {
    return `${route.actualDurationMinutes} min`;
  }

  if ((route.status === 'signs_placed' || route.status === 'signs_picked_up') && route.actualStartTime) {
    const minutes = Math.max(
      1,
      Math.round((Date.now() - new Date(route.actualStartTime).getTime()) / 60000)
    );
    return `${minutes} min (in progress)`;
  }

  return '—';
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

function isPlacementPhase(status?: string | null) {
  return status === 'signs_placed';
}

function isPickupPhase(status?: string | null) {
  return status === 'signs_picked_up';
}

function RouteDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const { user } = useAuthenticator();
  const canManagePlanning = isAdmin(user);

  const [route, setRoute] = useState<Route | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
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
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const [transitioning, setTransitioning] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Mobile execution: per-stop completion notes
  const [stopCompletionNotes, setStopCompletionNotes] = useState<Record<string, string>>({});
  const [stopCompletionPhoto, setStopCompletionPhoto] = useState<Record<string, File | null>>({});

  const completeRouteNow = useCallback(async (routeToComplete: Route) => {
    const now = new Date();
    const start = routeToComplete.actualStartTime ? new Date(routeToComplete.actualStartTime) : now;
    const actualDurationMinutes = Math.round((now.getTime() - start.getTime()) / 60000);
    const completedAt = now.toISOString();

    const { errors } = await updateRouteExecution(routeToComplete.id, {
      status: 'completed',
      actualEndTime: completedAt,
      actualDurationMinutes,
    });

    if (errors && errors.length > 0) {
      setTransitionError('Failed to complete route.');
      return false;
    }

    setRoute((r) =>
      r
        ? {
            ...r,
            status: 'completed',
            actualEndTime: completedAt,
            actualDurationMinutes,
          }
        : r
    );
    return true;
  }, []);

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

        if (isPickupPhase(route.status)) {
          const pickupStops = updatedStops.filter((s) => s.serviceType === 'pickup');
          const allPickedUp = pickupStops.every((s) => isStopCompleted(s));
          if (allPickedUp) {
            await completeRouteNow(route);
          }
        }
      }
    } catch { /* ignore */ }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, [completeRouteNow, route, stopCompletionNotes, stops]);

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
          standingInstructions?: string | null;
          defaultNumberOfSigns?: number | null;
          defaultAgentName?: string | null;
          agentOptions?: string[] | null;
        } | null;
        setCustomerName(customer?.name || 'Unknown customer');
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

  const handleStartRoute = async () => {
    if (!route) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const startedAt = new Date().toISOString();
      const { errors } = await updateRouteExecution(route.id, {
        status: 'signs_placed',
        actualStartTime: startedAt,
      });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to start route.');
      } else {
        setRoute((r) => (r ? { ...r, status: 'signs_placed', actualStartTime: startedAt } : r));
      }
    } catch {
      setTransitionError('Failed to start route.');
    }
    setTransitioning(false);
  };

  const handleStartPickupPhase = async () => {
    if (!route) return;
    setTransitioning(true);
    setTransitionError(null);

    try {
      const { errors } = await updateRouteExecution(route.id, {
        status: 'signs_picked_up',
      });

      if (errors && errors.length > 0) {
        setTransitionError('Failed to start pickup phase.');
      } else {
        const nextRoute = { ...route, status: 'signs_picked_up' as const };
        setRoute(nextRoute);

        const pickupStops = stops.filter((stop) => stop.serviceType === 'pickup');
        const allPickedUp = pickupStops.every((stop) => isStopCompleted(stop));
        if (allPickedUp) {
          await completeRouteNow(nextRoute);
        }
      }
    } catch {
      setTransitionError('Failed to start pickup phase.');
    }

    setTransitioning(false);
  };

  const handleCompleteRoute = async () => {
    if (!route) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      await completeRouteNow(route);
    } catch {
      setTransitionError('Failed to complete route.');
    }
    setTransitioning(false);
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
    if (!canManagePlanning) {
      return;
    }
    if (!window.confirm('Delete this stop?')) return;
    await deleteStop(stopId);
    const remaining = stops.filter((s) => s.id !== stopId);
    const client = generateClient<Schema>();
    await Promise.all(
      remaining.map((s, idx) =>
        client.models.Stop.update({ id: s.id, sequence: idx + 1 })
      )
    );
    await fetchStops();
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
  const visibleStops = (() => {
    if (!route) return stops;

    if (isPlacementPhase(route.status)) {
      return stops.filter((stop) => stop.serviceType !== 'pickup' && !isStopCompleted(stop));
    }

    if (isPickupPhase(route.status)) {
      return stops.filter((stop) => stop.serviceType === 'pickup' && !isStopCompleted(stop));
    }

    return stops;
  })();
  const topVisibleStopId = visibleStops[0]?.id ?? null;
  const pickupStops = stops.filter((stop) => stop.serviceType === 'pickup');
  const allPickupStopsCompleted = pickupStops.every((stop) => isStopCompleted(stop));

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
          <div className={styles.routeCard}>
            <div className={styles.routeCardHeader}>
              <h1 className={styles.routeTitle}>
                Route {route.routeCode || route.id.slice(0, 8)}
              </h1>
              <StatusBadge status={route.status} />
              <Link href={`/operator/routes/edit?id=${route.id}`} className={styles.btnRouteEdit}>
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
                <div className={styles.infoLabel}>Duration</div>
                <div className={styles.infoValue}>{formatRouteDuration(route)}</div>
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
              {isPlacementPhase(route.status) && (
                <button
                  onClick={handleStartPickupPhase}
                  disabled={transitioning}
                  className={styles.btnComplete}
                >
                  {transitioning ? 'Updating…' : 'Start Pickup Phase'}
                </button>
              )}
              {isPickupPhase(route.status) && (
                <button
                  onClick={handleCompleteRoute}
                  disabled={transitioning || !allPickupStopsCompleted}
                  className={styles.btnComplete}
                >
                  {transitioning ? 'Completing…' : allPickupStopsCompleted ? 'Complete Route' : 'Awaiting Pickups'}
                </button>
              )}
              {transitionError && (
                <span className={styles.transitionError}>{transitionError}</span>
              )}
            </div>
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
              <RouteStopsMap stops={stops} activeStopId={topVisibleStopId} />
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
                  defaultAgentName={customerDefaults?.defaultAgentName ?? undefined}
                  availableAgents={customerDefaults?.agentOptions ?? undefined}
                  isSubmitting={addingStop}
                  error={addStopError}
                  submitLabel="Add Stop"
                />
              </div>
            )}

            {visibleStops.length === 0 && !showAddStop && (isPlacementPhase(route?.status) || isPickupPhase(route?.status)) && (
              <div className={styles.emptyState}>
                {isPlacementPhase(route?.status)
                  ? 'All signs are placed. Start the pickup phase to continue.'
                  : 'All pickup stops are complete. Route will auto-complete after final pickup.'}
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
                        defaultAgentName={customerDefaults?.defaultAgentName ?? undefined}
                        availableAgents={customerDefaults?.agentOptions ?? undefined}
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
                          disabled={reordering}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteStop(stop.id)}
                          className={styles.btnDelete}
                          disabled={reordering}
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Execution actions — visible to all operators when route is active */}
                    {(isPlacementPhase(route?.status) || isPickupPhase(route?.status)) && (
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
