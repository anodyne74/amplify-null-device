'use client';

import { useState } from 'react';
import styles from './StopForm.module.css';
import { AddressAutocompleteInput, type ResolvedAddress } from './AddressAutocompleteInput';

interface StopFormProps {
  initialValues?: {
    address?: string;
    serviceType?: 'delivery' | 'pickup' | 'inspection';
    estimatedArrivalTime?: string;
    numberOfSigns?: number;
    agent?: string;
    isAuction?: boolean;
    notes?: string;
  };
  onSubmit: (values: {
    address: string;
    serviceType: 'delivery' | 'pickup' | 'inspection';
    estimatedArrivalTime?: string;
    numberOfSigns?: number;
    agent?: string;
    isAuction?: boolean;
    notes?: string;
    latitude?: number;
    longitude?: number;
    formattedAddress?: string;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
  submitLabel?: string;
}

export function StopForm({
  initialValues,
  onSubmit,
  onCancel,
  isSubmitting,
  error,
  submitLabel = 'Add Stop',
}: StopFormProps) {
  const [address, setAddress] = useState(initialValues?.address || '');
  const [serviceType, setServiceType] = useState<'delivery' | 'pickup' | 'inspection'>(
    initialValues?.serviceType || 'delivery'
  );
  const [estimatedArrivalTime, setEstimatedArrivalTime] = useState(
    initialValues?.estimatedArrivalTime || ''
  );
  const [numberOfSigns, setNumberOfSigns] = useState(
    initialValues?.numberOfSigns?.toString() || ''
  );
  const [agent, setAgent] = useState(initialValues?.agent || '');
  const [isAuction, setIsAuction] = useState(Boolean(initialValues?.isAuction));
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setValidationError(null);

    if (!address.trim()) {
      setValidationError('Address is required.');
      return;
    }

    let parsedSigns: number | undefined;
    if (numberOfSigns.trim()) {
      parsedSigns = parseInt(numberOfSigns, 10);
      if (Number.isNaN(parsedSigns) || parsedSigns < 0) {
        setValidationError('Number of signs must be 0 or greater.');
        return;
      }
    }

    await onSubmit({
      address: address.trim(),
      serviceType,
      estimatedArrivalTime: estimatedArrivalTime || undefined,
      numberOfSigns: parsedSigns,
      agent: agent.trim() || undefined,
      isAuction,
      notes: notes || undefined,
      latitude: resolvedAddress?.latitude,
      longitude: resolvedAddress?.longitude,
      formattedAddress: resolvedAddress?.formattedAddress,
    });
  };

  return (
    <div>
      {(validationError || error) && (
        <div className={styles.errorBanner}>
          {validationError || error}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="address" className={styles.label}>
          Address <span className={styles.required}>*</span>
        </label>
        <AddressAutocompleteInput
          id="address"
          value={address}
          onChange={(val) => setAddress(val)}
          onResolved={(resolved) => {
            setResolvedAddress(resolved);
            if (resolved) setAddress(resolved.formattedAddress);
          }}
          className={styles.input}
          disabled={isSubmitting}
          placeholder="Start typing an address…"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="serviceType" className={styles.label}>
          Service Type
        </label>
        <select
          id="serviceType"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as 'delivery' | 'pickup' | 'inspection')}
          className={styles.select}
          disabled={isSubmitting}
        >
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
          <option value="inspection">Inspection</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="estimatedArrivalTime" className={styles.label}>
          Estimated Arrival Time
        </label>
        <input
          id="estimatedArrivalTime"
          type="datetime-local"
          value={estimatedArrivalTime}
          onChange={(e) => setEstimatedArrivalTime(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="numberOfSigns" className={styles.label}>
          Number of Signs
        </label>
        <input
          id="numberOfSigns"
          type="number"
          min={0}
          value={numberOfSigns}
          onChange={(e) => setNumberOfSigns(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
          placeholder="e.g. 4"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="agent" className={styles.label}>
          Listing Agent
        </label>
        <input
          id="agent"
          type="text"
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
          placeholder="e.g. Jamie Lee"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="isAuction" className={styles.label}>
          <input
            id="isAuction"
            type="checkbox"
            checked={isAuction}
            onChange={(e) => setIsAuction(e.target.checked)}
            disabled={isSubmitting}
          />
          Is Auction
        </label>
      </div>

      <div className={styles.field}>
        <label htmlFor="stopNotes" className={styles.label}>
          Notes
        </label>
        <textarea
          id="stopNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={styles.textarea}
          disabled={isSubmitting}
          placeholder="Optional notes…"
        />
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={isSubmitting}
          className={styles.btnSubmit}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
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
    </div>
  );
}
