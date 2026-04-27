'use client';

import { useState } from 'react';
import styles from './StopForm.module.css';

interface StopFormProps {
  initialValues?: {
    address?: string;
    serviceType?: 'delivery' | 'pickup' | 'inspection';
    estimatedArrivalTime?: string;
    notes?: string;
  };
  onSubmit: (values: {
    address: string;
    serviceType: 'delivery' | 'pickup' | 'inspection';
    estimatedArrivalTime?: string;
    notes?: string;
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
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!address.trim()) {
      setValidationError('Address is required.');
      return;
    }

    await onSubmit({
      address: address.trim(),
      serviceType,
      estimatedArrivalTime: estimatedArrivalTime || undefined,
      notes: notes || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(validationError || error) && (
        <div className={styles.errorBanner}>
          {validationError || error}
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="address" className={styles.label}>
          Address <span className={styles.required}>*</span>
        </label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
          placeholder="e.g. 123 Main St, Springfield"
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
          type="submit"
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
    </form>
  );
}
