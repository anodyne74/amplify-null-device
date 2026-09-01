'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/app/components/ToastProvider';
import { StopForm } from '@/app/operator/components/StopForm';
import { geocodeAddress } from '@/lib/googleMaps';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import type { Stop } from '@/amplify/types';
import type { RouteDateBlockResult } from '@/lib/routeScheduleGuard';
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
  defaultAgentInitials?: string | null;
  agentOptions?: string[] | null;
}

interface RouteFormProps {
  customers: RouteFormCustomer[];
  onSubmit: (values: {
    routeCode: string;
    customerId: string;
    scheduledDate: string;
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
  /** Checks the chosen customer/date against the service calendar. Omit to skip the check (e.g. in tests). */
  onCheckDateBlock?: (customerId: string, date: string) => Promise<RouteDateBlockResult>;
}

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
  onCheckDateBlock,
}: RouteFormProps) {
  const [routeCode, setRouteCode] = useState(initialRouteCode);
  const [customerId, setCustomerId] = useState('');
  const [scheduledDate, setScheduledDate] = useState(todayDateKey);
  const [blockCheck, setBlockCheck] = useState<{ status: 'idle' | 'checking' | 'ok' | 'blocked' } & RouteDateBlockResult>({
    status: 'idle',
    blocked: false,
  });
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
  const { showToast } = useToast();

  // The parent owns the create mutation and reports failures through the
  // `error` prop; track the latest value so the post-submit success check
  // below does not read a stale closure.
  const submitErrorRef = useRef<string | null>(error ?? null);
  useEffect(() => {
    submitErrorRef.current = error ?? null;
  }, [error]);

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

  useEffect(() => {
    if (!onCheckDateBlock || !customerId || !scheduledDate) {
      setBlockCheck({ status: 'idle', blocked: false });
      return;
    }

    let cancelled = false;
    setBlockCheck({ status: 'checking', blocked: false });

    void onCheckDateBlock(customerId, scheduledDate)
      .then((result) => {
        if (!cancelled) {
          setBlockCheck({ status: result.blocked ? 'blocked' : 'ok', ...result });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBlockCheck({ status: 'idle', blocked: false });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [onCheckDateBlock, customerId, scheduledDate]);

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

  const blockedDateMessage = () => {
    if (blockCheck.status !== 'blocked') return null;
    if (blockCheck.type === 'no_drivers') {
      return `Null Device has no drivers available on ${scheduledDate}${blockCheck.reason ? ` (${blockCheck.reason})` : ''}. Choose another date, or clear the block on the service calendar.`;
    }
    return `${selectedCustomer?.name ?? 'This customer'}'s agency is closed on ${scheduledDate}${blockCheck.reason ? ` (${blockCheck.reason})` : ''}. Choose another date.`;
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

    if (!scheduledDate) {
      setValidationError('Please choose a scheduled date.');
      return;
    }

    if (stops.length === 0) {
      setValidationError('Add at least one stop before creating a route.');
      return;
    }

    if (blockCheck.status === 'blocked') {
      setValidationError(blockedDateMessage());
      return;
    }

    await onSubmit({ routeCode: routeCode.trim(), customerId, scheduledDate, notes, stops });

    // Defer one tick so a failure flagged during submit has propagated back
    // down via the `error` prop before we announce success.
    setTimeout(() => {
      if (!submitErrorRef.current) {
        showToast('Route created', 'success');
      }
    }, 0);
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
    <Card>
      <form onSubmit={handleSubmit} noValidate>
        {(validationError || error || stopError || copyError) && (
          <div className={styles.errorBanner}>
            {validationError || error || stopError || copyError}
          </div>
        )}

        <div className={styles.fieldsStack}>
          <Field label="Route ID" htmlFor="routeCode" required>
            <Input
              id="routeCode"
              value={routeCode}
              onChange={(e) => setRouteCode(e.target.value)}
              disabled={isSubmitting}
              placeholder="e.g. W18-26-001"
            />
          </Field>

          <Field label="Customer" htmlFor="customerId" required>
            <Select
              id="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="">Select a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.email})
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Scheduled date"
            htmlFor="scheduledDate"
            required
            error={blockedDateMessage()}
            hint={blockCheck.status === 'checking' ? 'Checking the service calendar…' : undefined}
          >
            <Input
              id="scheduledDate"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              disabled={isSubmitting}
            />
          </Field>

          <Field label="Notes" htmlFor="notes">
            <Input
              id="notes"
              multiline
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isSubmitting}
              placeholder="Optional notes…"
            />
          </Field>
        </div>

        <div className={styles.stopsSection}>
          <div className={styles.stopsHeaderRow}>
            <h2 className={styles.stopsHeading}>Stops</h2>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowAddStop((v) => !v)}
              disabled={isSubmitting || addingStop}
            >
              {showAddStop ? 'Close Stop Form' : 'Add Stop'}
            </Button>
          </div>

          {canCopyStops && (
            <Field label="Copy stops from previous route" htmlFor="copyRouteId" className={styles.copyStopsRow}>
              <div className={styles.copyStopsControls}>
                <Select
                  id="copyRouteId"
                  value={selectedCopySourceId}
                  onChange={(e) => {
                    setSelectedCopySourceId(e.target.value);
                    setCopyError(null);
                  }}
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
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  loading={copyingStops}
                  onClick={handleCopyStops}
                  disabled={isSubmitting || copyingStops || !customerId || !selectedCopySourceId}
                >
                  {copyingStops ? 'Copying...' : 'Copy Stops'}
                </Button>
              </div>
            </Field>
          )}

          {showAddStop && (
            <div className={styles.stopFormCard}>
              <StopForm
                onSubmit={handleAddStop}
                onCancel={() => setShowAddStop(false)}
                addressSearchOrigin={customerAddressOrigin}
                standingInstructions={selectedCustomer?.standingInstructions ?? undefined}
                defaultNumberOfSigns={selectedCustomer?.defaultNumberOfSigns ?? undefined}
                defaultAgentInitials={selectedCustomer?.defaultAgentInitials ?? undefined}
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
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => removeStop(index)}
                    disabled={isSubmitting}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className={styles.mapSection}>
            <RouteStopsMap stops={mapStops} />
          </div>
        </div>

        <div className={styles.actions}>
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting || blockCheck.status === 'blocked' || blockCheck.status === 'checking'}
          >
            {isSubmitting ? 'Creating…' : 'Create Route'}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
