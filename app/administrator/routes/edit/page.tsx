'use client';

import dynamic from 'next/dynamic';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { generateClient } from 'aws-amplify/data';
import OperatorRoute from '@/app/components/OperatorRoute';
import LoadingSpinner from '@/app/components/LoadingSpinner';
import { StopForm } from '@/app/operator/components/StopForm';
import { geocodeAddress } from '@/lib/googleMaps';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { listAllCustomers } from '@/lib/queries/ListAllCustomers';
import { createStop, updateRoute } from '@/lib/queries';
import { deleteStop } from '@/lib/queries/DeleteStop';
import { updateStop } from '@/lib/queries/UpdateStop';
import type { Schema } from '@/amplify/data/resource';
import type { Route, Stop } from '@/amplify/types';
import styles from './page.module.css';

type CustomerOption = { id: string; name: string; email: string; addressLine1?: string | null };

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
  const [stopError, setStopError] = useState<string | null>(null);

  const [routeCode, setRouteCode] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [customerAddressOrigin, setCustomerAddressOrigin] = useState<{ latitude: number; longitude: number } | null>(null);

  const fetchStops = useCallback(async () => {
    if (!routeId) return;
    const client = generateClient<Schema>();
    const { data, errors } = await client.models.Stop.list({
      filter: { routeId: { eq: routeId } },
    });

    if (!errors || errors.length === 0) {
      const sorted = [...((data as unknown as Stop[]) || [])].sort(
        (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
      );
      setStops(sorted);
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

      const [routeResult, customersResult] = await Promise.all([
        getRouteDetail(routeId),
        listAllCustomers({ limit: 200 }),
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

      if (!customersResult.errors || customersResult.errors.length === 0) {
        setCustomers(
          (customersResult.data as CustomerOption[]).map((c) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            addressLine1: c.addressLine1 ?? null,
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId || !customerId) {
      setError('Customer is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const result = await updateRoute(routeId, {
      routeCode: routeCode.trim(),
      customerId,
      notes: notes || '',
    });

    if (result.errors && result.errors.length > 0) {
      setError('Failed to update route.');
      setSaving(false);
      return;
    }

    router.push(`/administrator/routes/detail?id=${routeId}`);
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
    if (!window.confirm('Delete this stop?')) return;
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

  if (loading) {
    return <LoadingSpinner message="Loading route..." />;
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.heading}>Edit Route</h1>

      <form className={styles.card} onSubmit={handleSave}>
        <div className={styles.routeCode}>Route Code: {routeCode}</div>
        <div className={styles.internalId}>Internal ID: {routeId}</div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.field}>
          <label htmlFor="customerId" className={styles.label}>Customer</label>
          <select
            id="customerId"
            className={styles.select}
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
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="notes" className={styles.label}>Notes</label>
          <textarea
            id="notes"
            className={styles.textarea}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={saving}
            placeholder="Optional notes"
          />
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.btnSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={() => router.push(`/administrator/routes/detail?id=${routeId}`)}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </form>

      <section className={styles.card}>
        <div className={styles.stopsHeader}>
          <h2 className={styles.stopsTitle}>Stops ({stops.length})</h2>
          <button
            type="button"
            className={styles.btnAddStop}
            onClick={() => {
              setShowAddStop((v) => !v);
              setEditingStopId(null);
            }}
            disabled={stopSaving}
          >
            {showAddStop ? 'Close Stop Form' : 'Add Stop'}
          </button>
        </div>

        {stopError && <div className={styles.error}>{stopError}</div>}
        {reordering && <div className={styles.reordering}>Saving stop order...</div>}
        {!reordering && stops.length > 1 && (
          <p className={styles.dragHint}>Drag cards to reorder stops</p>
        )}

        <div className={styles.mapWrap}>
          <h3 className={styles.mapTitle}>Route Map and Ordered Addresses</h3>
          <RouteStopsMap stops={stops} />
        </div>

        {showAddStop && (
          <div className={styles.stopFormWrap}>
            <h3 className={styles.formTitle}>Add Stop</h3>
            <StopForm
              onSubmit={handleAddStop}
              onCancel={() => setShowAddStop(false)}
              addressSearchOrigin={customerAddressOrigin}
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
                    <h3 className={styles.formTitle}>Edit Stop</h3>
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
                      isSubmitting={stopSaving}
                      submitLabel="Save Stop"
                    />
                  </div>
                );
              }

              return (
                <div
                  key={stop.id}
                  className={`${styles.stopRow}${draggingStopId === stop.id ? ` ${styles.stopRowDragging}` : ''}`}
                  draggable={!reordering && !stopSaving}
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
                  <div className={styles.stopActions}>
                    <button
                      type="button"
                      className={styles.btnMove}
                      onClick={() => {
                        void handleMoveStop(stop.id, 'up');
                      }}
                      disabled={index === 0 || reordering || stopSaving}
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      className={styles.btnMove}
                      onClick={() => {
                        void handleMoveStop(stop.id, 'down');
                      }}
                      disabled={index === stops.length - 1 || reordering || stopSaving}
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      className={styles.btnEdit}
                      onClick={() => {
                        setEditingStopId(stop.id);
                        setShowAddStop(false);
                      }}
                      disabled={stopSaving}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.btnDelete}
                      onClick={() => {
                        void handleDeleteStop(stop.id);
                      }}
                      disabled={stopSaving}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
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
