'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { StopForm } from '@/app/operator/components/StopForm';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { geocodeAddress } from '@/lib/googleMaps';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { createStop, getRouteWithStops, getUserSettings, updateRoute } from '@/lib/queries';
import { deleteStop } from '@/lib/queries/DeleteStop';
import { updateStop } from '@/lib/queries/UpdateStop';
import type { Route, Stop } from '@/amplify/types';
import type { MapTheme } from '@/lib/mapThemes';
import styles from './page.module.css';

type CustomerOption = {
  id: string;
  name: string;
  email: string;
  addressLine1?: string | null;
  standingInstructions?: string | null;
  defaultNumberOfSigns?: number | null;
  defaultAgentInitials?: string | null;
  agentOptions?: string[] | null;
};

type OperatorOption = {
  sub: string;
  name: string;
  email: string;
};

async function callAdminApi(body: Record<string, unknown>) {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new Error('No session token found. Please sign in again.');
  }

  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed.');
  }
  return payload;
}

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

function RouteEditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeId = searchParams.get('id') ?? '';
  const { user } = useAuthenticator();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [stops, setStops] = useState<Stop[]>([]);
  const [showAddStop, setShowAddStop] = useState(false);
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [stopSaving, setStopSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);
  const [pendingDeleteStopId, setPendingDeleteStopId] = useState<string | null>(null);

  const [routeCode, setRouteCode] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [customerAddressOrigin, setCustomerAddressOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapTheme, setMapTheme] = useState<MapTheme>('light');

  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [assignedOperatorSub, setAssignedOperatorSub] = useState('');
  const [initialAssignedOperatorSub, setInitialAssignedOperatorSub] = useState('');
  const [savedAssignedOperatorEmail, setSavedAssignedOperatorEmail] = useState<string | null>(null);
  const [notifying, setNotifying] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifySuccess, setNotifySuccess] = useState<string | null>(null);

  const fetchStops = useCallback(async () => {
    if (!routeId) return;
    const { stops: allStops, errors } = await getRouteWithStops(routeId);

    if (!errors || errors.length === 0) {
      setStops(allStops as Stop[]);
    }
  }, [routeId]);

  const persistStopOrder = useCallback(async (orderedStops: Stop[]) => {
    setReordering(true);
    setStopError(null);

    const resequenced = orderedStops.map((stop, index) => ({
      ...stop,
      sequence: index + 1,
    }));
    setStops(resequenced);

    const updates = await Promise.all(
      resequenced.map((stop) =>
        updateStop({
          id: stop.id,
          sequence: stop.sequence,
        })
      )
    );

    if (updates.some((result) => result.errors && result.errors.length > 0)) {
      setStopError('Failed to save stop order. Reloading latest order.');
      await fetchStops();
    }

    setReordering(false);
  }, [fetchStops]);

  useEffect(() => {
    async function load() {
      if (!routeId) {
        setError('Missing route ID.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const [routeResult, customersResult, operatorsResult] = await Promise.all([
        getRouteDetail(routeId),
        listAllCustomers({ limit: 200 }),
        callAdminApi({ action: 'listUsersInGroup', groupName: 'operator' }).catch(() => ({ users: [] })),
      ]);

      if (routeResult.errors || !routeResult.data) {
        setError('Failed to load route.');
        setLoading(false);
        return;
      }

      const route = routeResult.data as unknown as Route;
      setRouteCode(route.routeCode || route.id.slice(0, 8));
      setCustomerId(route.customerId);
      setNotes(route.notes || '');
      setAssignedOperatorSub(route.assignedOperatorSub || '');
      setInitialAssignedOperatorSub(route.assignedOperatorSub || '');
      setSavedAssignedOperatorEmail(route.assignedOperatorEmail || null);

      const operatorUsers = (operatorsResult.users as Array<{ sub?: string; name?: string; email?: string }> | undefined) || [];
      setOperators(
        operatorUsers
          .filter((u): u is { sub: string; name: string; email: string } => Boolean(u.sub && u.email))
          .map((u) => ({ sub: u.sub, name: u.name || u.email, email: u.email }))
      );

      if (!customersResult.errors || customersResult.errors.length === 0) {
        setCustomers(
          (customersResult.data as CustomerOption[]).map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            addressLine1: c.addressLine1 ?? null,
            standingInstructions: c.standingInstructions ?? null,
            defaultNumberOfSigns: c.defaultNumberOfSigns ?? null,
            defaultAgentInitials: c.defaultAgentInitials ?? null,
            agentOptions: c.agentOptions ?? null,
          }))
        );
      }

      await fetchStops();

      setLoading(false);
    }

    void load();
  }, [routeId, fetchStops]);

  useEffect(() => {
    const selected = customers.find((c) => c.id === customerId);
    if (!selected?.addressLine1) {
      setCustomerAddressOrigin(null);
      return;
    }

    let cancelled = false;
    void geocodeAddress(selected.addressLine1)
      .then((resolved) => {
        if (!cancelled) {
          setCustomerAddressOrigin({ latitude: resolved.latitude, longitude: resolved.longitude });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCustomerAddressOrigin(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [customerId, customers]);

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

  useEffect(() => {
    if (stops.length === 0) {
      setSelectedStopId(null);
      return;
    }

    if (selectedStopId && stops.some((stop) => stop.id === selectedStopId)) {
      return;
    }

    setSelectedStopId(stops[0].id);
  }, [selectedStopId, stops]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId || !customerId) {
      setError('Customer is required.');
      return;
    }
    if (!routeCode.trim()) {
      setError('Route code is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const selectedOperator = operators.find((op) => op.sub === assignedOperatorSub);
    const assignmentChanged = assignedOperatorSub !== initialAssignedOperatorSub;

    const result = await updateRoute(routeId, {
      routeCode: routeCode.trim(),
      customerId,
      notes: notes || '',
      assignedOperatorSub: selectedOperator?.sub || null,
      assignedOperatorName: selectedOperator?.name || null,
      assignedOperatorEmail: selectedOperator?.email || null,
      ...(assignmentChanged
        ? { assignedAt: selectedOperator ? new Date().toISOString() : null }
        : {}),
    });

    if (result.errors && result.errors.length > 0) {
      setError('Failed to update route.');
      setSaving(false);
      return;
    }

    router.push(`/administrator/routes/detail?id=${routeId}`);
  };

  const handleNotifyOperator = async () => {
    if (!routeId) return;
    setNotifying(true);
    setNotifyError(null);
    setNotifySuccess(null);

    try {
      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) {
        throw new Error('No session token found. Please sign in again.');
      }

      const response = await fetch('/api/admin/send-job-assigned-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ routeId }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to notify operator.');
      }

      setNotifySuccess(`Notified ${payload.sentTo}.`);
    } catch (err) {
      setNotifyError(err instanceof Error ? err.message : 'Failed to notify operator.');
    }

    setNotifying(false);
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
    if (!routeId || !customerId) return;

    setStopSaving(true);
    setStopError(null);
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
        routeId,
        customerId,
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
        setStopError('Failed to add stop.');
      } else {
        setShowAddStop(false);
        await fetchStops();
      }
    } catch {
      setStopError('Failed to add stop.');
    }
    setStopSaving(false);
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

    setStopSaving(true);
    setStopError(null);
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
        setStopError('Failed to update stop.');
      } else {
        setEditingStopId(null);
        await fetchStops();
      }
    } catch {
      setStopError('Failed to update stop.');
    }
    setStopSaving(false);
  };

  const handleDeleteStop = async (stopId: string) => {
    if (stopSaving) return;
    setStopSaving(true);
    setStopError(null);

    const result = await deleteStop(stopId);
    if (result.errors && result.errors.length > 0) {
      setStopError('Failed to delete stop.');
      setStopSaving(false);
      return;
    }

    const remaining = stops.filter((stop) => stop.id !== stopId);
    await persistStopOrder(remaining);
    setPendingDeleteStopId(null);
    setStopSaving(false);
  };

  const handleDropStop = async (targetId: string) => {
    if (!draggingStopId || draggingStopId === targetId || reordering) return;
    const from = stops.findIndex((s) => s.id === draggingStopId);
    const to = stops.findIndex((s) => s.id === targetId);
    if (from === -1 || to === -1) return;
    const reordered = [...stops];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setDraggingStopId(null);
    await persistStopOrder(reordered);
  };

  const handleMoveStop = async (stopId: string, direction: 'up' | 'down') => {
    if (reordering) return;
    const currentIndex = stops.findIndex((stop) => stop.id === stopId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= stops.length) return;

    const reordered = [...stops];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    await persistStopOrder(reordered);
  };

  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const availableAgentsForStops = useMemo(() => {
    const customerAgents = selectedCustomer?.agentOptions ?? [];
    const routeAgents = stops
      .map((stop) => stop.agent?.trim())
      .filter((agent): agent is string => Boolean(agent));

    return Array.from(new Set([...customerAgents, ...routeAgents]));
  }, [selectedCustomer?.agentOptions, stops]);
  const defaultAgentForStops = selectedCustomer?.defaultAgentInitials ?? availableAgentsForStops[0] ?? undefined;

  if (loading) {
    return <LoadingSpinner message="Loading route..." />;
  }

  return (
    <div className={styles.container}>
      <PageHeader title="Edit Route" />

      <Card>
        <form onSubmit={handleSave}>
          <div className={styles.metaRow}>
            <span>Internal ID: <strong>{routeId}</strong></span>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.fieldsGrid}>
            <Field label="Route Code" htmlFor="routeCode" required>
              <Input
                id="routeCode"
                value={routeCode}
                onChange={(e) => setRouteCode(e.target.value)}
                disabled={saving}
                placeholder="e.g. W18-26-001"
              />
            </Field>

            <Field label="Customer" htmlFor="customerId">
              <Select
                id="customerId"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                disabled={saving}
                required
              >
                <option value="">Select a customer…</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Notes" htmlFor="notes">
              <Input
                id="notes"
                multiline
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={saving}
                placeholder="Optional notes"
              />
            </Field>

            <Field label="Assigned Operator" htmlFor="assignedOperatorSub">
              <Select
                id="assignedOperatorSub"
                value={assignedOperatorSub}
                onChange={(e) => setAssignedOperatorSub(e.target.value)}
                disabled={saving}
              >
                <option value="">Unassigned</option>
                {operators.map((operator) => (
                  <option key={operator.sub} value={operator.sub}>
                    {operator.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className={styles.actionsRow}>
            <Button type="submit" loading={saving} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push(`/administrator/routes/detail?id=${routeId}`)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => { void handleNotifyOperator(); }}
              loading={notifying}
              disabled={notifying || !savedAssignedOperatorEmail}
            >
              {notifying ? 'Notifying...' : 'Notify Operator'}
            </Button>
          </div>
          {notifyError && <div className={styles.errorBanner}>{notifyError}</div>}
          {notifySuccess && <p className={styles.successText}>{notifySuccess}</p>}
        </form>
      </Card>

      <Card>
        <div className={styles.stopsHeaderRow}>
          <h2 className={styles.stopsHeading}>Stops ({stops.length})</h2>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setShowAddStop((v) => !v);
              setEditingStopId(null);
            }}
            disabled={stopSaving}
          >
            {showAddStop ? 'Close Stop Form' : 'Add Stop'}
          </Button>
        </div>

        {stopError && <div className={styles.errorBanner}>{stopError}</div>}
        {reordering && <p className={styles.reorderingText}>Saving stop order...</p>}
        {!reordering && stops.length > 1 && (
          <p className={styles.dragHint}>Drag cards to reorder stops</p>
        )}

        <div className={styles.stopsLayout}>
          <div>
            {showAddStop && (
              <div className={styles.stopFormWrap}>
                <h3 className={styles.formHeading}>Add Stop</h3>
                <StopForm
                  onSubmit={handleAddStop}
                  onCancel={() => setShowAddStop(false)}
                  addressSearchOrigin={customerAddressOrigin}
                  standingInstructions={selectedCustomer?.standingInstructions ?? undefined}
                  defaultNumberOfSigns={selectedCustomer?.defaultNumberOfSigns ?? undefined}
                  defaultAgentInitials={defaultAgentForStops}
                  availableAgents={availableAgentsForStops}
                  isSubmitting={stopSaving}
                  submitLabel="Add Stop"
                />
              </div>
            )}

            {stops.length === 0 && !showAddStop ? (
              <p className={styles.emptyStops}>No stops yet.</p>
            ) : (
              <div className={styles.stopList}>
                {stops.map((stop, index) => {
                  if (editingStopId === stop.id) {
                    return (
                      <div key={stop.id} className={styles.stopFormWrap}>
                        <h3 className={styles.formHeading}>Edit Stop</h3>
                        <StopForm
                          initialValues={{
                            address: stop.address,
                            serviceType: stop.serviceType as 'delivery' | 'pickup' | 'inspection' | undefined,
                            numberOfSigns: stop.numberOfSigns ?? undefined,
                            agent: stop.agent ?? undefined,
                            isAuction: Boolean(stop.isAuction),
                            notes: stop.notes ?? undefined,
                          }}
                          onSubmit={handleEditStop}
                          onCancel={() => setEditingStopId(null)}
                          addressSearchOrigin={customerAddressOrigin}
                          standingInstructions={selectedCustomer?.standingInstructions ?? undefined}
                          defaultNumberOfSigns={selectedCustomer?.defaultNumberOfSigns ?? undefined}
                          defaultAgentInitials={defaultAgentForStops}
                          availableAgents={availableAgentsForStops}
                          isSubmitting={stopSaving}
                          submitLabel="Save Stop"
                        />
                      </div>
                    );
                  }

                  return (
                    <div
                      key={stop.id}
                      className={`${styles.stopRow}${draggingStopId === stop.id ? ` ${styles.stopRowDragging}` : ''}${selectedStopId === stop.id ? ` ${styles.stopRowSelected}` : ''}`}
                      draggable={!reordering && !stopSaving}
                      onClick={() => setSelectedStopId(stop.id)}
                      onDragStart={() => setDraggingStopId(stop.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { void handleDropStop(stop.id); }}
                      onDragEnd={() => setDraggingStopId(null)}
                    >
                      <div className={styles.stopSequence}>{stop.sequence ?? index + 1}</div>
                      <div className={styles.stopBody}>
                        <div className={styles.stopAddress}>{stop.formattedAddress || stop.address || 'Unknown address'}</div>
                        <div className={styles.stopMeta}>{stop.serviceType || 'delivery'}</div>
                        {typeof stop.numberOfSigns === 'number' && (
                          <div className={styles.stopDetail}>Signs: {stop.numberOfSigns}</div>
                        )}
                        {stop.agent && (
                          <div className={styles.stopDetail}>Agent: {stop.agent}</div>
                        )}
                        {stop.isAuction && (
                          <span className={styles.auctionBadge}>Auction</span>
                        )}
                      </div>
                      <div className={styles.stopActionsRow}>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void handleMoveStop(stop.id, 'up');
                          }}
                          disabled={index === 0 || reordering || stopSaving}
                        >
                          Up
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            void handleMoveStop(stop.id, 'down');
                          }}
                          disabled={index === stops.length - 1 || reordering || stopSaving}
                        >
                          Down
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingStopId(stop.id);
                            setShowAddStop(false);
                            setPendingDeleteStopId(null);
                          }}
                          disabled={stopSaving}
                        >
                          Edit
                        </Button>
                        {pendingDeleteStopId === stop.id ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              onClick={() => {
                                void handleDeleteStop(stop.id);
                              }}
                              disabled={stopSaving}
                            >
                              {stopSaving ? 'Deleting...' : 'Confirm Delete'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setPendingDeleteStopId(null);
                              }}
                              disabled={stopSaving}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              setPendingDeleteStopId(stop.id);
                            }}
                            disabled={stopSaving}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className={styles.mapWrap}>
            <h3 className={styles.mapTitle}>Route Map</h3>
            <RouteStopsMap
              stops={stops}
              mapTheme={mapTheme}
              activeStopId={selectedStopId}
              onStopSelect={(stopId) => setSelectedStopId(stopId)}
            />
          </aside>
        </div>
      </Card>
    </div>
  );
}

export default function RouteEditPage() {
  return (
    <OperatorRoute requireAdmin>
      <Suspense fallback={<LoadingSpinner message="Loading route..." />}>
        <RouteEditContent />
      </Suspense>
    </OperatorRoute>
  );
}
