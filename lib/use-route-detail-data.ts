'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Stop } from '@/amplify/types';
import { isAdmin } from '@/lib/amplify-config';
import { geocodeAddress } from '@/lib/googleMaps';
import { getCustomer } from '@/lib/queries';
import { useRouteWithStops } from '@/lib/useRouteWithStops';
import {
  createStop,
  deleteRoute as deleteRouteQuery,
  deleteStop as deleteStopQuery,
  resequenceStops,
  updateStop as updateStopQuery,
} from '@/lib/routes';

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

export interface AddStopCapability {
  visible: boolean;
  open: () => void;
  close: () => void;
  adding: boolean;
  error: string | null;
  add: (values: StopFormValues) => Promise<void>;
}

export interface EditStopCapability {
  stopId: string | null;
  editing: boolean;
  error: string | null;
  start: (stopId: string) => void;
  cancel: () => void;
  save: (values: StopFormValues) => Promise<void>;
}

export interface DeleteStopCapability {
  deletingId: string | null;
  pendingId: string | null;
  confirm: (stopId: string) => void;
  cancel: () => void;
  remove: (stopId: string) => Promise<void>;
}

export interface ReorderCapability {
  draggingStopId: string | null;
  startDragging: (stopId: string) => void;
  clearDragging: () => void;
  reordering: boolean;
  /** Also surfaces deleteStop's remove() failures — both operations resequence
   * the stop list through the same persistStopOrder() path. */
  error: string | null;
  dropStop: (targetStopId: string) => Promise<void>;
  moveStop: (stopId: string, direction: 'up' | 'down') => Promise<void>;
}

export interface DeleteRouteCapability {
  pending: boolean;
  deleting: boolean;
  confirm: () => void;
  cancel: () => void;
  remove: () => Promise<boolean>;
}

/**
 * Shared fetch/reorder/CRUD engine behind the Operator and Administrator Route
 * Detail pages. Deliberately excludes anything that diverges between the two
 * portals (invoice/distance overrides, legacy in-page stop execution, map
 * theme) — those stay page-local and reach back in only via refetch(),
 * never through a setter. The Route and its Stops are live, via
 * useRouteWithStops.
 */
export function useRouteDetailData(id: string, user: unknown) {
  const canManagePlanning = isAdmin(user);

  const {
    route,
    stops,
    loading: routeLoading,
    error: routeError,
    patchStop,
    refetch,
  } = useRouteWithStops(id || null);
  const [customerLoading, setCustomerLoading] = useState(true);
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

  const persistStopOrder = useCallback(
    async (orderedStops: Stop[]) => {
      await resequenceStops(orderedStops.map((stop) => stop.id));
      await refetch();
    },
    [refetch]
  );

  const reorderStopsInternal = useCallback(
    async (reorderedStops: Stop[]) => {
      const resequenced = reorderedStops.map((stop, index) => ({
        ...stop,
        sequence: index + 1,
      }));

      resequenced.forEach((stop) => patchStop(stop.id, { sequence: stop.sequence }));
      setReordering(true);
      setReorderError(null);

      try {
        await persistStopOrder(resequenced);
      } catch {
        setReorderError('Failed to save stop order. Restoring latest server order...');
        await refetch();
      } finally {
        setReordering(false);
      }
    },
    [patchStop, persistStopOrder, refetch]
  );

  const customerId = route?.customerId ?? null;

  useEffect(() => {
    if (!customerId) return;
    let cancelled = false;

    async function fetchCustomer(customerId: string) {
      setCustomerLoading(true);
      try {
        const customerResult = await getCustomer(customerId);
        if (cancelled) return;
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
              if (!cancelled) setCustomerAddressOrigin({ latitude: resolved.latitude, longitude: resolved.longitude });
            } catch {
              if (!cancelled) setCustomerAddressOrigin(null);
            }
          } else {
            setCustomerAddressOrigin(null);
          }
        }
      } catch (err) {
        console.error('Error loading route detail:', err);
        if (!cancelled) setError('Failed to load route.');
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }

    fetchCustomer(customerId);
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  const loading = routeLoading || (Boolean(route) && customerLoading);
  const loadError = !id
    ? 'No route was specified.'
    : !routeLoading && (routeError || !route)
      ? 'Failed to load route.'
      : null;

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
          await refetch();
        }
      } catch {
        setAddStopError('Failed to add stop.');
      }
      setAddingStop(false);
    },
    [canManagePlanning, refetch, route, stops.length]
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
          await refetch();
        }
      } catch (err) {
        setEditStopError(err instanceof Error ? err.message : 'Failed to update stop.');
      }
      setEditingStop(false);
    },
    [canManagePlanning, editingStopId, refetch, stops]
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
        await refetch();
      } finally {
        setDraggingStopId(null);
      }
    },
    [canManagePlanning, draggingStopId, reordering, reorderStopsInternal, refetch, stops]
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

  const addStopCapability: AddStopCapability = {
    visible: showAddStop,
    open: openAddStop,
    close: closeAddStop,
    adding: addingStop,
    error: addStopError,
    add: addStop,
  };

  const editStopCapability: EditStopCapability = {
    stopId: editingStopId,
    editing: editingStop,
    error: editStopError,
    start: startEditingStop,
    cancel: cancelEditingStop,
    save: editStop,
  };

  const deleteStopCapability: DeleteStopCapability = {
    deletingId: deletingStopId,
    pendingId: pendingDeleteStopId,
    confirm: confirmDeleteStop,
    cancel: cancelDeleteStop,
    remove: deleteStop,
  };

  const reorderCapability: ReorderCapability = {
    draggingStopId,
    startDragging,
    clearDragging,
    reordering,
    error: reorderError,
    dropStop,
    moveStop,
  };

  const deleteRouteCapability: DeleteRouteCapability = {
    pending: routePendingDelete,
    deleting: deletingRoute,
    confirm: confirmDeleteRoute,
    cancel: cancelDeleteRoute,
    remove: deleteRoute,
  };

  return {
    route,
    stops,
    loading,
    error: error ?? loadError,
    customerName,
    customerRatePerHour,
    customerAddressOrigin,
    customerDefaults,
    canManagePlanning,
    availableAgentsForStops,
    defaultAgentForStops,

    refetch,

    addStop: addStopCapability,
    editStop: editStopCapability,
    deleteStop: deleteStopCapability,
    reorder: reorderCapability,
    deleteRoute: deleteRouteCapability,
  };
}

export type RouteDetailData = ReturnType<typeof useRouteDetailData>;
