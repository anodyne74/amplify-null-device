'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { StopForm } from '@/app/operator/components/StopForm';
import { isAdmin } from '@/lib/amplify-config';
import { geocodeAddress } from '@/lib/googleMaps';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { createStop, getCustomer, updateRouteExecution, updateStopExecution } from '@/lib/queries';
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
  const badgeClass = { planned: styles.badgePlanned, active: styles.badgeActive, completed: styles.badgeCompleted, archived: styles.badgeArchived }[(status ?? 'planned') as string] ?? styles.badgePlanned;
  return (
    <span className={`${styles.badge} ${badgeClass}`}>
      {status || 'unknown'}
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

  if (route.status === 'active' && route.actualStartTime) {
    const minutes = Math.max(
      1,
      Math.round((Date.now() - new Date(route.actualStartTime).getTime()) / 60000)
    );
    return `${minutes} min (in progress)`;
  }

  return '—';
}

function RouteDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const { user } = useAuthenticator();
  const canManagePlanning = isAdmin(user);

  const [route, setRoute] = useState<Route | null>(null);
  const [customerName, setCustomerName] = useState<string>('');
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
  const [stopExecuting, setStopExecuting] = useState<Record<string, boolean>>({});
  const [transitionError, setTransitionError] = useState<string | null>(null);

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
    setStopExecuting((prev) => ({ ...prev, [stopId]: true }));
    try {
      const completedAt = new Date().toISOString();
      const { errors } = await updateStopExecution(stopId, { actualDepartureTime: completedAt });
      if (!errors || errors.length === 0) {
        setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, actualDepartureTime: completedAt } : s)));
      }
    } catch { /* ignore */ }
    setStopExecuting((prev) => ({ ...prev, [stopId]: false }));
  }, []);

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
        setCustomerName((customerResult.data as { name?: string } | null)?.name || 'Unknown customer');
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
        status: 'active',
        actualStartTime: startedAt,
      });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to start route.');
      } else {
        setRoute((r) => (r ? { ...r, status: 'active', actualStartTime: startedAt } : r));
      }
    } catch {
      setTransitionError('Failed to start route.');
    }
    setTransitioning(false);
  };

  const handleCompleteRoute = async () => {
    if (!route) return;
    setTransitioning(true);
    setTransitionError(null);
    try {
      const now = new Date();
      const start = route.actualStartTime ? new Date(route.actualStartTime) : now;
      const actualDurationMinutes = Math.round((now.getTime() - start.getTime()) / 60000);
      const { errors } = await updateRouteExecution(route.id, {
        status: 'completed',
        actualEndTime: now.toISOString(),
        actualDurationMinutes,
      });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to complete route.');
      } else {
        setRoute((r) =>
          r
            ? {
                ...r,
                status: 'completed',
                actualEndTime: now.toISOString(),
                actualDurationMinutes,
              }
            : r
        );
      }
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
              {route.status === 'active' && (
                <button
                  onClick={handleCompleteRoute}
                  disabled={transitioning}
                  className={styles.btnComplete}
                >
                  {transitioning ? 'Completing…' : 'Complete Route'}
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
                Stops ({stops.length})
              </h2>
              {canManagePlanning && !showAddStop && (
                <button
                  onClick={() => setShowAddStop(true)}
                  className={styles.btnAddStop}
                >
                  Add Stop
                </button>
              )}
            </div>

            <div className={styles.mapSection}>
              <h3 className={styles.mapHeading}>Route Map and Ordered Addresses</h3>
              <RouteStopsMap stops={stops} />
            </div>

            {canManagePlanning && (
              <div className={styles.reorderHint}>Drag and drop stop cards to change sequence.</div>
            )}
            {reordering && <div className={styles.reorderStatus}>Saving updated stop order...</div>}
            {reorderError && <div className={styles.errorBanner}>{reorderError}</div>}

            {/* Add Stop Form */}
            {showAddStop && (
              <div className={styles.formContainer}>
                <h3 className={styles.formHeading}>Add Stop</h3>
                <StopForm
                  onSubmit={handleAddStop}
                  onCancel={() => {
                    setShowAddStop(false);
                    setAddStopError(null);
                  }}
                  isSubmitting={addingStop}
                  error={addStopError}
                  submitLabel="Add Stop"
                />
              </div>
            )}

            {stops.length === 0 && !showAddStop && (
              <div className={styles.emptyState}>
                No stops yet. Click &quot;Add Stop&quot; to add the first one.
              </div>
            )}

            <div className={styles.stopsList}>
              {stops.map((stop, index) => {
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
                const stopSvcBadgeClass = { delivery: styles.svcBadgeDelivery, pickup: styles.svcBadgePickup, inspection: styles.svcBadgeInspection }[svcKey] ?? '';
                return (
                  <div
                    key={stop.id}
                    className={`${styles.stopCard} ${stopCardClass} ${draggingStopId === stop.id ? styles.stopCardDragging : ''}`}
                    draggable={canManagePlanning && !reordering}
                    onDragStart={() => setDraggingStopId(stop.id)}
                    onDragOver={(event) => {
                      if (canManagePlanning) {
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
                      <span className={`${styles.svcBadge} ${stopSvcBadgeClass}`}>
                        {stop.serviceType || 'delivery'}
                      </span>
                      {typeof stop.numberOfSigns === 'number' && (
                        <div className={styles.stopEta}>Signs: {stop.numberOfSigns}</div>
                      )}
                      {stop.agent && (
                        <div className={styles.stopEta}>Agent: {stop.agent}</div>
                      )}
                      {stop.isAuction && (
                        <span className={styles.auctionBadge}>Auction</span>
                      )}
                      {stop.notes && (
                        <div className={styles.stopNotes}>
                          {stop.notes}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {canManagePlanning && (
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
                          disabled={index === stops.length - 1 || reordering}
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
                    {route?.status === 'active' && (
                      <div className={styles.stopExecution}>
                        {!stop.actualArrivalTime && (
                          <button
                            onClick={() => { void handleStopArrived(stop.id); }}
                            className={styles.btnArrived}
                            disabled={!!stopExecuting[stop.id]}
                          >
                            {stopExecuting[stop.id] ? 'Saving…' : 'Arrived'}
                          </button>
                        )}
                        {stop.actualArrivalTime && !stop.actualDepartureTime && (
                          <>
                            <span className={styles.execTimestamp}>
                              Arrived: {formatDateTime(stop.actualArrivalTime)}
                            </span>
                            <button
                              onClick={() => { void handleStopCompleted(stop.id); }}
                              className={styles.btnExecComplete}
                              disabled={!!stopExecuting[stop.id]}
                            >
                              {stopExecuting[stop.id]
                                ? 'Saving…'
                                : stop.serviceType === 'pickup'
                                ? 'Collected Signs'
                                : 'Placed Signs'}
                            </button>
                          </>
                        )}
                        {stop.actualArrivalTime && stop.actualDepartureTime && (
                          <div className={styles.execDone}>
                            <span>Arrived: {formatDateTime(stop.actualArrivalTime)}</span>
                            <span>
                              {stop.serviceType === 'pickup' ? 'Collected' : 'Placed'}:{' '}
                              {formatDateTime(stop.actualDepartureTime)}
                            </span>
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
