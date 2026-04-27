'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { StopForm } from '@/app/operator/components/StopForm';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { createStop } from '@/lib/queries';
import { deleteStop } from '@/lib/queries/DeleteStop';
import { updateStop } from '@/lib/queries/UpdateStop';
import type { Route, Stop, RouteStatus } from '@/amplify/types';
import styles from './page.module.css';

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

function RouteDetailContent() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';

  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddStop, setShowAddStop] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState<string | null>(null);

  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editingStop, setEditingStop] = useState(false);
  const [editStopError, setEditStopError] = useState<string | null>(null);

  const [transitioning, setTransitioning] = useState(false);
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
      setRoute(routeResult.data as unknown as Route);
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
      const client = generateClient<Schema>();
      const { errors } = await client.models.Route.update({
        id: route.id,
        status: 'active',
        actualStartTime: new Date().toISOString(),
      });
      if (errors && errors.length > 0) {
        setTransitionError('Failed to start route.');
      } else {
        setRoute((r) => r ? { ...r, status: 'active', actualStartTime: new Date().toISOString() } : r);
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
      const client = generateClient<Schema>();
      const now = new Date();
      const start = route.actualStartTime ? new Date(route.actualStartTime) : now;
      const actualDurationMinutes = Math.round((now.getTime() - start.getTime()) / 60000);
      const { errors } = await client.models.Route.update({
        id: route.id,
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
    estimatedArrivalTime?: string;
    notes?: string;
  }) => {
    if (!route) return;
    setAddingStop(true);
    setAddStopError(null);
    try {
      const result = await createStop({
        routeId: route.id,
        customerId: route.customerId,
        sequence: stops.length + 1,
        address: values.address,
        serviceType: values.serviceType,
        estimatedArrivalTime: values.estimatedArrivalTime,
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
    estimatedArrivalTime?: string;
    notes?: string;
  }) => {
    if (!editingStopId) return;
    setEditingStop(true);
    setEditStopError(null);
    try {
      const result = await updateStop({
        id: editingStopId,
        address: values.address,
        serviceType: values.serviceType,
        estimatedArrivalTime: values.estimatedArrivalTime,
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
                Route {route.id.slice(0, 8)}
              </h1>
              <StatusBadge status={route.status} />
            </div>

            <div className={styles.routeInfoGrid}>
              <div>
                <div className={styles.infoLabel}>Customer ID</div>
                <div className={styles.infoValueMono}>{route.customerId.slice(0, 8)}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>Created</div>
                <div className={styles.infoValue}>{formatDate(route.createdAt)}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>Est. Duration</div>
                <div className={styles.infoValue}>
                  {route.estimatedDurationMinutes
                    ? `${route.estimatedDurationMinutes} min`
                    : '—'}
                </div>
              </div>
              <div>
                <div className={styles.infoLabel}>Actual Duration</div>
                <div className={styles.infoValue}>
                  {route.actualDurationMinutes ? `${route.actualDurationMinutes} min` : '—'}
                </div>
              </div>
              <div>
                <div className={styles.infoLabel}>Start Time</div>
                <div className={styles.infoValue}>{formatDateTime(route.actualStartTime)}</div>
              </div>
              <div>
                <div className={styles.infoLabel}>End Time</div>
                <div className={styles.infoValue}>{formatDateTime(route.actualEndTime)}</div>
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
              {!showAddStop && (
                <button
                  onClick={() => setShowAddStop(true)}
                  className={styles.btnAddStop}
                >
                  Add Stop
                </button>
              )}
            </div>

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
              {stops.map((stop) => {
                if (editingStopId === stop.id) {
                  return (
                    <div key={stop.id} className={styles.formContainer}>
                      <h3 className={styles.formHeading}>Edit Stop</h3>
                      <StopForm
                        initialValues={{
                          address: stop.address,
                          serviceType: stop.serviceType as 'delivery' | 'pickup' | 'inspection' | undefined,
                          estimatedArrivalTime: stop.estimatedArrivalTime ?? undefined,
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
                    className={`${styles.stopCard} ${stopCardClass}`}
                  >
                    {/* Sequence circle */}
                    <div className={`${styles.circle} ${stopCircleClass}`}>
                      {stop.sequence ?? '?'}
                    </div>

                    {/* Details */}
                    <div>
                      <div className={styles.stopAddress}>
                        {stop.address}
                      </div>
                      <span className={`${styles.svcBadge} ${stopSvcBadgeClass}`}>
                        {stop.serviceType || 'delivery'}
                      </span>
                      {stop.estimatedArrivalTime && (
                        <div className={styles.stopEta}>
                          ETA: {formatDateTime(stop.estimatedArrivalTime)}
                        </div>
                      )}
                      {stop.notes && (
                        <div className={styles.stopNotes}>
                          {stop.notes}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className={styles.stopActions}>
                      <button
                        onClick={() => setEditingStopId(stop.id)}
                        className={styles.btnEdit}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteStop(stop.id)}
                        className={styles.btnDelete}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
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
