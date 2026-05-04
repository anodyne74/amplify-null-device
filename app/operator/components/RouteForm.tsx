'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
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

interface RouteFormProps {
  customers: Array<{ id: string; name: string; email: string }>;
  onSubmit: (values: {
    customerId: string;
    notes: string;
    stops: RouteDraftStop[];
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export function RouteForm({ customers, onSubmit, onCancel, isSubmitting, error }: RouteFormProps) {
  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [stops, setStops] = useState<RouteDraftStop[]>([]);
  const [showAddStop, setShowAddStop] = useState(false);
  const [addingStop, setAddingStop] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

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

    if (stops.length === 0) {
      setValidationError('Add at least one stop before creating a route.');
      return;
    }

    await onSubmit({ customerId, notes, stops });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(validationError || error || stopError) && (
        <div className={styles.errorBanner}>
          {validationError || error || stopError}
        </div>
      )}

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

        {showAddStop && (
          <div className={styles.stopFormCard}>
            <StopForm
              onSubmit={handleAddStop}
              onCancel={() => setShowAddStop(false)}
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
