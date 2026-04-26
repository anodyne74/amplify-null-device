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

const STATUS_COLORS: Record<RouteStatus, string> = {
  planned: '#1976d2',
  active: '#f57c00',
  completed: '#388e3c',
  archived: '#757575',
};

const SERVICE_TYPE_COLORS: Record<string, string> = {
  delivery: '#4caf50',
  pickup: '#ff9800',
  inspection: '#2196f3',
};

function StatusBadge({ status }: { status?: string | null }) {
  const color = STATUS_COLORS[(status as RouteStatus)] || '#757575';
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        backgroundColor: color,
        color: 'white',
        borderRadius: '12px',
        fontSize: '12px',
        fontWeight: 'bold',
        textTransform: 'uppercase',
      }}
    >
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
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Back link */}
      <Link
        href="/operator/routes"
        style={{ color: '#1b5e20', textDecoration: 'none', fontSize: '14px' }}
      >
        ← Back to Routes
      </Link>

      {error && (
        <div
          style={{
            padding: '16px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            marginTop: '16px',
          }}
        >
          {error}
        </div>
      )}

      {route && (
        <>
          {/* Route Header */}
          <div
            style={{
              marginTop: '20px',
              padding: '20px',
              backgroundColor: 'white',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                marginBottom: '16px',
              }}
            >
              <h1 style={{ margin: 0, fontSize: '22px', color: '#1b5e20' }}>
                Route {route.id.slice(0, 8)}
              </h1>
              <StatusBadge status={route.status} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '16px',
                fontSize: '14px',
              }}
            >
              <div>
                <div style={{ color: '#999', fontSize: '12px' }}>Customer ID</div>
                <div style={{ fontFamily: 'monospace' }}>{route.customerId.slice(0, 8)}</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '12px' }}>Created</div>
                <div>{formatDate(route.createdAt)}</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '12px' }}>Est. Duration</div>
                <div>
                  {route.estimatedDurationMinutes
                    ? `${route.estimatedDurationMinutes} min`
                    : '—'}
                </div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '12px' }}>Actual Duration</div>
                <div>
                  {route.actualDurationMinutes ? `${route.actualDurationMinutes} min` : '—'}
                </div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '12px' }}>Start Time</div>
                <div>{formatDateTime(route.actualStartTime)}</div>
              </div>
              <div>
                <div style={{ color: '#999', fontSize: '12px' }}>End Time</div>
                <div>{formatDateTime(route.actualEndTime)}</div>
              </div>
            </div>

            {route.notes && (
              <div style={{ marginTop: '12px', fontSize: '14px', color: '#555' }}>
                <span style={{ fontWeight: '600' }}>Notes: </span>
                {route.notes}
              </div>
            )}

            {/* Status transitions */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              {route.status === 'planned' && (
                <button
                  onClick={handleStartRoute}
                  disabled={transitioning}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#f57c00',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: transitioning ? 'not-allowed' : 'pointer',
                    opacity: transitioning ? 0.7 : 1,
                  }}
                >
                  {transitioning ? 'Starting…' : 'Start Route'}
                </button>
              )}
              {route.status === 'active' && (
                <button
                  onClick={handleCompleteRoute}
                  disabled={transitioning}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#388e3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: transitioning ? 'not-allowed' : 'pointer',
                    opacity: transitioning ? 0.7 : 1,
                  }}
                >
                  {transitioning ? 'Completing…' : 'Complete Route'}
                </button>
              )}
              {transitionError && (
                <span style={{ color: '#c62828', fontSize: '14px' }}>{transitionError}</span>
              )}
            </div>
          </div>

          {/* Stops Section */}
          <div style={{ marginTop: '24px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px',
              }}
            >
              <h2 style={{ margin: 0, fontSize: '18px', color: '#1b5e20' }}>
                Stops ({stops.length})
              </h2>
              {!showAddStop && (
                <button
                  onClick={() => setShowAddStop(true)}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#1b5e20',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Add Stop
                </button>
              )}
            </div>

            {/* Add Stop Form */}
            {showAddStop && (
              <div
                style={{
                  padding: '20px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #e0e0e0',
                  borderRadius: '8px',
                  marginBottom: '16px',
                }}
              >
                <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Add Stop</h3>
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
              <div
                style={{
                  padding: '32px',
                  textAlign: 'center',
                  color: '#666',
                  border: '1px dashed #ccc',
                  borderRadius: '8px',
                }}
              >
                No stops yet. Click &quot;Add Stop&quot; to add the first one.
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stops.map((stop) => {
                if (editingStopId === stop.id) {
                  return (
                    <div
                      key={stop.id}
                      style={{
                        padding: '20px',
                        backgroundColor: '#f9f9f9',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                      }}
                    >
                      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Edit Stop</h3>
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

                const color = SERVICE_TYPE_COLORS[stop.serviceType as string] || '#1976d2';
                return (
                  <div
                    key={stop.id}
                    style={{
                      padding: '16px',
                      backgroundColor: 'white',
                      border: `2px solid ${color}`,
                      borderRadius: '8px',
                      display: 'grid',
                      gridTemplateColumns: '48px 1fr auto',
                      gap: '16px',
                      alignItems: 'start',
                    }}
                  >
                    {/* Sequence circle */}
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '50%',
                        backgroundColor: color,
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '16px',
                        flexShrink: 0,
                      }}
                    >
                      {stop.sequence ?? '?'}
                    </div>

                    {/* Details */}
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                        {stop.address}
                      </div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          backgroundColor: color,
                          color: 'white',
                          borderRadius: '8px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          textTransform: 'uppercase',
                          marginBottom: '4px',
                        }}
                      >
                        {stop.serviceType || 'delivery'}
                      </span>
                      {stop.estimatedArrivalTime && (
                        <div style={{ fontSize: '12px', color: '#666' }}>
                          ETA: {formatDateTime(stop.estimatedArrivalTime)}
                        </div>
                      )}
                      {stop.notes && (
                        <div style={{ fontSize: '12px', color: '#999', fontStyle: 'italic', marginTop: '4px' }}>
                          {stop.notes}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => setEditingStopId(stop.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'white',
                          color: '#1b5e20',
                          border: '1px solid #1b5e20',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteStop(stop.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'white',
                          color: '#c62828',
                          border: '1px solid #c62828',
                          borderRadius: '4px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
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
