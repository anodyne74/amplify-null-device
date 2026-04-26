'use client';

import { useState } from 'react';

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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontSize: '14px',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '4px',
    fontWeight: '600',
    fontSize: '14px',
  };

  const fieldStyle: React.CSSProperties = {
    marginBottom: '16px',
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      {(validationError || error) && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#ffebee',
            color: '#c62828',
            borderRadius: '4px',
            marginBottom: '16px',
            fontSize: '14px',
          }}
        >
          {validationError || error}
        </div>
      )}

      <div style={fieldStyle}>
        <label htmlFor="address" style={labelStyle}>
          Address <span style={{ color: '#c62828' }}>*</span>
        </label>
        <input
          id="address"
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          style={inputStyle}
          disabled={isSubmitting}
          placeholder="e.g. 123 Main St, Springfield"
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="serviceType" style={labelStyle}>
          Service Type
        </label>
        <select
          id="serviceType"
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as 'delivery' | 'pickup' | 'inspection')}
          style={inputStyle}
          disabled={isSubmitting}
        >
          <option value="delivery">Delivery</option>
          <option value="pickup">Pickup</option>
          <option value="inspection">Inspection</option>
        </select>
      </div>

      <div style={fieldStyle}>
        <label htmlFor="estimatedArrivalTime" style={labelStyle}>
          Estimated Arrival Time
        </label>
        <input
          id="estimatedArrivalTime"
          type="datetime-local"
          value={estimatedArrivalTime}
          onChange={(e) => setEstimatedArrivalTime(e.target.value)}
          style={inputStyle}
          disabled={isSubmitting}
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="stopNotes" style={labelStyle}>
          Notes
        </label>
        <textarea
          id="stopNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
          disabled={isSubmitting}
          placeholder="Optional notes…"
        />
      </div>

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            padding: '10px 24px',
            backgroundColor: '#1b5e20',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
          }}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          style={{
            padding: '10px 24px',
            backgroundColor: 'white',
            color: '#333',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
