'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import type { Route, Stop } from '@/amplify/types';
import { isAdmin } from '@/lib/amplify-config';
import { geocodeAddress } from '@/lib/googleMaps';
import { getRouteDetail } from '@/lib/queries/GetRouteDetail';
import { createStop, deleteRoute as deleteRouteQuery, getCustomer, listAllStopsForRoute } from '@/lib/queries';
import { deleteStop as deleteStopQuery } from '@/lib/queries/DeleteStop';
import { updateStop as updateStopQuery } from '@/lib/queries/UpdateStop';

export interface CustomerDefaults {
  standingInstructions?: string | null;
  defaultNumberOfSigns?: number | null;
  defaultAgentInitials?: string | null;
  agentOptions?: string[] | null;
}

export interface StopFormValues {
  address: string;
  serviceType: 'delivery' | 'pickup' | 'inspection';
  numberOfSigns?: number;
  agent?: string;
  isAuction?: boolean;
  notes?: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
}

/**
 * Shared fetch/reorder/CRUD engine behind the Operator and Administrator Route
 * Detail pages. Deliberately excludes anything that diverges between the two
 * portals (invoice/distance overrides, legacy in-page stop execution, map
 * theme) — those stay page-local and reach back in only via refetchRoute()/
 * refetchStops(), never through a setter.
 */
export function useRouteDetailData(id: string, user: unknown) {
  const canManagePlanning = isAdmin(user);

  const [route, setRoute] = useState<Route | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [customerRatePerHour, setCustomerRatePerHour] = useState<number | null>(null);
  const [customerAddressOrigin, setCustomerAddressOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [customerDefaults, setCustomerDefaults] = useState<CustomerDefaults | null>(null);

  const [showAddStop, setShowAddStop] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [addStopError, setAddStopError] = useState<string | null>(null);

  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editingStop, setEditingStop] = useState(false);
  const [editStopError, setEditStopError] = useState<string | null>(null);

  const [draggingStopId, setDraggingStopId] = useState<string | null>(null);
  const [deletingStopId, setDeletingStopId] = useState<string | null>(null);
  const [pendingDeleteStopId, setPendingDeleteStopId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);

  const [deletingRoute, setDeletingRoute] = useState(false);
  const [routePendingDelete, setRoutePendingDelete] = useState(false);

  const refetchStops = useCallback(async () => {
    const { stops: data, errors } = await listAllStopsForRoute(id);
    if (!errors || errors.length === 0) {
      const sorted = [...((data as unknown as Stop[]) || [])].sort(
        (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)
      );
      setStops(sorted);
    }
  }, [id]);

  const refetchRoute = useCallback(async () => {
    const result = await getRouteDetail(id);
    if (!result.errors && result.data) {
      setRoute(result.data as unknown as Route);
    }
  }, [id]);

  const persistStopOrder = useCallback(
    async (orderedStops: Stop[]) => {
      const client = generateClient<Schema>();
      const updates = orderedStops.map((stop, index) =>
        client.models.Stop.update({ id: stop.id, sequence: index + 1 })
      );
      await Promise.all(updates);
      await refetchStops();
    },
    [refetchStops]
  );

  const reorderStopsInternal = useCallback(
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
        await refetchStops();
      } finally {
        setReordering(false);
      }
    },
    [persistStopOrder, refetchStops]
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

        await refetchStops();
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
  }, [id, refetchStops]);

  const openAddStop = useCallback(() => setShowAddStop(true), []);
  const closeAddStop = useCallback(() => {
    setShowAddStop(false);
    setAddStopError(null);
  }, []);

  const addStop = useCallback(
    async (values: StopFormValues) => {
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
          await refetchStops();
        }
      } catch {
        setAddStopError('Failed to add stop.');
      }
      setAddingStop(false);
    },
    [canManagePlanning, refetchStops, route, stops.length]
  );

  const startEditingStop = useCallback((stopId: string) => setEditingStopId(stopId), []);
  const cancelEditingStop = useCallback(() => {
    setEditingStopId(null);
    setEditStopError(null);
  }, []);

  const editStop = useCallback(
    async (values: StopFormValues) => {
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

        const result = await updateStopQuery({
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
          await refetchStops();
        }
      } catch (err) {
        setEditStopError(err instanceof Error ? err.message : 'Failed to update stop.');
      }
      setEditingStop(false);
    },
    [canManagePlanning, editingStopId, refetchStops, stops]
  );

  const confirmDeleteStop = useCallback((stopId: string) => setPendingDeleteStopId(stopId), []);
  const cancelDeleteStop = useCallback(() => {
    if (!deletingStopId) setPendingDeleteStopId(null);
  }, [deletingStopId]);

  const deleteStop = useCallback(
    async (stopId: string) => {
      if (!canManagePlanning || deletingStopId) {
        return;
      }

      setDeletingStopId(stopId);
      setReorderError(null);
      try {
        const result = await deleteStopQuery(stopId);
        if (result.errors && result.errors.length > 0) {
          setReorderError('Failed to delete stop. Please try again.');
          return;
        }

        const remaining = stops.filter((s) => s.id !== stopId);
        await persistStopOrder(remaining);
      } catch {
        setReorderError('Failed to delete stop. Please try again.');
      } finally {
        setDeletingStopId(null);
        setPendingDeleteStopId(null);
      }
    },
    [canManagePlanning, deletingStopId, persistStopOrder, stops]
  );

  const startDragging = useCallback((stopId: string) => setDraggingStopId(stopId), []);
  const clearDragging = useCallback(() => setDraggingStopId(null), []);

  const dropStop = useCallback(
    async (targetStopId: string) => {
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
        await reorderStopsInternal(reordered);
      } catch {
        setReorderError('Failed to save stop order. Restoring latest server order...');
        await refetchStops();
      } finally {
        setDraggingStopId(null);
      }
    },
    [canManagePlanning, draggingStopId, reordering, reorderStopsInternal, refetchStops, stops]
  );

  const moveStop = useCallback(
    async (stopId: string, direction: 'up' | 'down') => {
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

      await reorderStopsInternal(reordered);
    },
    [canManagePlanning, reordering, reorderStopsInternal, stops]
  );

  const confirmDeleteRoute = useCallback(() => setRoutePendingDelete(true), []);
  const cancelDeleteRoute = useCallback(() => {
    if (!deletingRoute) setRoutePendingDelete(false);
  }, [deletingRoute]);

  const deleteRoute = useCallback(async () => {
    if (!route || !canManagePlanning || deletingRoute) return false;

    setDeletingRoute(true);
    setError(null);

    const result = await deleteRouteQuery(route.id);
    if (result.errors && result.errors.length > 0) {
      setError('Failed to delete route.');
      setDeletingRoute(false);
      setRoutePendingDelete(false);
      return false;
    }

    return true;
  }, [canManagePlanning, deletingRoute, route]);

  const availableAgentsForStops = useMemo(() => {
    const customerAgents = customerDefaults?.agentOptions ?? [];
    const routeAgents = stops
      .map((stop) => stop.agent?.trim())
      .filter((agent): agent is string => Boolean(agent));

    return Array.from(new Set([...customerAgents, ...routeAgents]));
  }, [customerDefaults?.agentOptions, stops]);
  const defaultAgentForStops = customerDefaults?.defaultAgentInitials ?? availableAgentsForStops[0] ?? undefined;

  return {
    route,
    stops,
    loading,
    error,
    customerName,
    customerRatePerHour,
    customerAddressOrigin,
    customerDefaults,
    canManagePlanning,
    availableAgentsForStops,
    defaultAgentForStops,

    refetchStops,
    refetchRoute,

    showAddStop,
    addingStop,
    addStopError,
    openAddStop,
    closeAddStop,
    addStop,

    editingStopId,
    editingStop,
    editStopError,
    startEditingStop,
    cancelEditingStop,
    editStop,

    deletingStopId,
    pendingDeleteStopId,
    confirmDeleteStop,
    cancelDeleteStop,
    deleteStop,

    draggingStopId,
    startDragging,
    clearDragging,
    reordering,
    reorderError,
    dropStop,
    moveStop,

    deletingRoute,
    routePendingDelete,
    confirmDeleteRoute,
    cancelDeleteRoute,
    deleteRoute,
  };
}

export type RouteDetailData = ReturnType<typeof useRouteDetailData>;
