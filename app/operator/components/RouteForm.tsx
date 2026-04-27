'use client';

import { useState } from 'react';
import styles from './RouteForm.module.css';

interface RouteFormProps {
  customers: Array<{ id: string; name: string; email: string }>;
  onSubmit: (values: { customerId: string; estimatedDurationMinutes: number; notes: string }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
  error?: string | null;
}

export function RouteForm({ customers, onSubmit, onCancel, isSubmitting, error }: RouteFormProps) {
  const [customerId, setCustomerId] = useState('');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!customerId) {
      setValidationError('Please select a customer.');
      return;
    }

    const duration = parseInt(estimatedDurationMinutes, 10);
    if (!estimatedDurationMinutes || isNaN(duration) || duration < 1) {
      setValidationError('Estimated duration must be at least 1 minute.');
      return;
    }

    await onSubmit({ customerId, estimatedDurationMinutes: duration, notes });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(validationError || error) && (
        <div className={styles.errorBanner}>
          {validationError || error}
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
        <label htmlFor="estimatedDurationMinutes" className={styles.label}>
          Estimated Duration (minutes) <span className={styles.required}>*</span>
        </label>
        <input
          id="estimatedDurationMinutes"
          type="number"
          min={1}
          value={estimatedDurationMinutes}
          onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
          className={styles.input}
          disabled={isSubmitting}
          placeholder="e.g. 120"
        />
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
