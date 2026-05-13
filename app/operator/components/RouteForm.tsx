'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { StopForm } from '@/app/operator/components/StopForm';
import { geocodeAddress } from '@/lib/googleMaps';
import type { Stop } from '@/amplify/types';
import styles from './RouteForm.module.css';

const RouteStopsMap = dynamic(
  () => import('@/app/operator/components/RouteStopsMap').then((mod) => mod.RouteStopsMap),
  {
    ssr: false,
    loading: () => <div className={styles.mapLoading}>Loading map preview...</div>,
  }
);

export interface RouteDraftStop {
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

interface RouteFormCustomer {
  id: string;
  name: string;
  email: string;
  addressLine1?: string | null;
  standingInstructions?: string | null;
  defaultNumberOfSigns?: number | null;
  defaultAgentName?: string | null;
  agentOptions?: string[] | null;
}

interface RouteFormProps {
  customers: RouteFormCustomer[];
  onSubmit: (values: {
    routeCode: string;
    customerId: string;
    notes: string;
    stops: RouteDraftStop[];
  }) => Promise<void>;
  initialRouteCode?: string;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  copyStopSources?: Array<{
    id: string;
    customerId: string;
    label: string;
  }>;
  onCopyStopsFromSource?: (sourceRouteId: string) => Promise<RouteDraftStop[]>;
}

export function RouteForm({
  customers,
  onSubmit,
  initialRouteCode = '',
  onCancel,
  isSubmitting,
  error,
  copyStopSources,
  onCopyStopsFromSource,
}: RouteFormProps) {
  const [routeCode, setRouteCode] = useState(initialRouteCode);
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [stops, setStops] = useState<RouteDraftStop[]>([]);
  const [showAddStop, setShowAddStop] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [selectedCopySourceId, setSelectedCopySourceId] = useState('');
  const [copyingStops, setCopyingStops] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [customerAddressOrigin, setCustomerAddressOrigin] = useState<{ latitude: number; longitude: number } | null>(null);

  const canCopyStops = Boolean(copyStopSources && onCopyStopsFromSource);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const copySourcesForCustomer = (copyStopSources ?? []).filter((route) => route.customerId === customerId);

  useEffect(() => {
    setRouteCode(initialRouteCode);
  }, [initialRouteCode]);

  useEffect(() => {
    setSelectedCopySourceId('');
    setCopyError(null);
  }, [customerId]);

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

  const mapStops: Stop[] = stops.map((stop, index) => ({
    id: `draft-${index + 1}`,
    routeId: 'draft-route',
    sequence: index + 1,
    address: stop.address,
    formattedAddress: stop.formattedAddress,
    latitude: stop.latitude,
    longitude: stop.longitude,
    serviceType: stop.serviceType,
    numberOfSigns: stop.numberOfSigns,
    agent: stop.agent,
    isAuction: stop.isAuction,
    notes: stop.notes,
  }));

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
    setAddingStop(true);
    setStopError(null);

    try {
      let geocoded: { latitude: number; longitude: number; formattedAddress: string } | undefined;

      if (values.latitude !== undefined && values.longitude !== undefined) {
        // Coordinates already resolved by the autocomplete input — no extra API call needed.
        geocoded = {
          latitude: values.latitude,
          longitude: values.longitude,
          formattedAddress: values.formattedAddress ?? values.address,
        };
      } else {
        try {
          geocoded = await geocodeAddress(values.address);
        } catch {
          setStopError('Stop added without coordinates. Map preview may be incomplete until address geocoding succeeds.');
        }
      }

      setStops((prev) => [
        ...prev,
        {
          ...values,
          latitude: geocoded?.latitude,
          longitude: geocoded?.longitude,
          formattedAddress: geocoded?.formattedAddress,
        },
      ]);
      setShowAddStop(false);
    } finally {
      setAddingStop(false);
    }
  };

  const removeStop = (index: number) => {
    setStops((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!customerId) {
      setValidationError('Please select a customer.');
      return;
    }

    if (!routeCode.trim()) {
      setValidationError('Please enter a route ID.');
      return;
    }

    if (stops.length === 0) {
      setValidationError('Add at least one stop before creating a route.');
      return;
    }

    await onSubmit({ routeCode: routeCode.trim(), customerId, notes, stops });
  };

  const handleCopyStops = async () => {
    if (!onCopyStopsFromSource) return;
    if (!selectedCopySourceId) {
      setCopyError('Select a previous route to copy from.');
      return;
    }

    setCopyError(null);
    setCopyingStops(true);
    try {
      const copiedStops = await onCopyStopsFromSource(selectedCopySourceId);
      if (copiedStops.length === 0) {
        setCopyError('The selected route has no stops to copy.');
        return;
      }

      setStops(copiedStops);
      setShowAddStop(false);
    } catch {
      setCopyError('Could not copy stops from the selected route.');
    } finally {
      setCopyingStops(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(validationError || error || stopError || copyError) && (
        <div className={styles.errorBanner}>
          {validationError || error || stopError || copyError}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="routeCode" className={styles.label}>
          Route ID <span className={styles.required}>*</span>
        </label>
        <input
          id="routeCode"
          value={routeCode}
          onChange={(e) => setRouteCode(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
          placeholder="e.g. W18-26-001"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="customerId" className={styles.label}>
          Customer <span className={styles.required}>*</span>
        </label>
        <select
          id="customerId"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className={styles.select}
          disabled={isSubmitting}
        >
          <option value="">Select a customer…</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.email})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="notes" className={styles.label}>
          Notes
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={styles.textarea}
          disabled={isSubmitting}
          placeholder="Optional notes…"
        />
      </div>

      <div className={styles.stopsSection}>
        <div className={styles.stopsHeaderRow}>
          <h2 className={styles.stopsHeading}>Stops</h2>
          <button
            type="button"
            className={styles.btnAddStop}
            onClick={() => setShowAddStop((v) => !v)}
            disabled={isSubmitting || addingStop}
          >
            {showAddStop ? 'Close Stop Form' : 'Add Stop'}
          </button>
        </div>

        {canCopyStops && (
          <div className={styles.copyStopsRow}>
            <label htmlFor="copyRouteId" className={styles.copyStopsLabel}>
              Copy stops from previous route
            </label>
            <div className={styles.copyStopsControls}>
              <select
                id="copyRouteId"
                value={selectedCopySourceId}
                onChange={(e) => {
                  setSelectedCopySourceId(e.target.value);
                  setCopyError(null);
                }}
                className={styles.select}
                disabled={!customerId || isSubmitting || copyingStops || copySourcesForCustomer.length === 0}
              >
                <option value="">
                  {!customerId
                    ? 'Select a customer first...'
                    : copySourcesForCustomer.length === 0
                      ? 'No previous routes available'
                      : 'Choose a route...'}
                </option>
                {copySourcesForCustomer.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.btnCopyStops}
                onClick={handleCopyStops}
                disabled={isSubmitting || copyingStops || !customerId || !selectedCopySourceId}
              >
                {copyingStops ? 'Copying...' : 'Copy Stops'}
              </button>
            </div>
          </div>
        )}

        {showAddStop && (
          <div className={styles.stopFormCard}>
            <StopForm
              onSubmit={handleAddStop}
              onCancel={() => setShowAddStop(false)}
              addressSearchOrigin={customerAddressOrigin}
              standingInstructions={selectedCustomer?.standingInstructions ?? undefined}
              defaultNumberOfSigns={selectedCustomer?.defaultNumberOfSigns ?? undefined}
              defaultAgentName={selectedCustomer?.defaultAgentName ?? undefined}
              availableAgents={selectedCustomer?.agentOptions ?? undefined}
              isSubmitting={addingStop}
              submitLabel="Add Stop to Route"
            />
          </div>
        )}

        {stops.length === 0 ? (
          <p className={styles.emptyStops}>No stops added yet.</p>
        ) : (
          <div className={styles.stopsList}>
            {stops.map((stop, index) => (
              <div key={`${stop.address}-${index}`} className={styles.stopRow}>
                <div className={styles.stopSequence}>{index + 1}</div>
                <div className={styles.stopContent}>
                  <div className={styles.stopAddress}>{stop.formattedAddress || stop.address}</div>
                  <div className={styles.stopMeta}>{stop.serviceType}</div>
                </div>
                <button
                  type="button"
                  className={styles.btnRemoveStop}
                  onClick={() => removeStop(index)}
                  disabled={isSubmitting}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.mapSection}>
          <RouteStopsMap stops={mapStops} />
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="submit"
          disabled={isSubmitting}
          className={styles.btnSubmit}
        >
          {isSubmitting ? 'Creating…' : 'Create Route'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={styles.btnCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
