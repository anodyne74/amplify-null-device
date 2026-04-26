'use client';

import { useState } from 'react';

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
        <label htmlFor="customerId" style={labelStyle}>
          Customer <span style={{ color: '#c62828' }}>*</span>
        </label>
        <select
          id="customerId"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          style={inputStyle}
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

      <div style={fieldStyle}>
        <label htmlFor="estimatedDurationMinutes" style={labelStyle}>
          Estimated Duration (minutes) <span style={{ color: '#c62828' }}>*</span>
        </label>
        <input
          id="estimatedDurationMinutes"
          type="number"
          min={1}
          value={estimatedDurationMinutes}
          onChange={(e) => setEstimatedDurationMinutes(e.target.value)}
          style={inputStyle}
          disabled={isSubmitting}
          placeholder="e.g. 120"
        />
      </div>

      <div style={fieldStyle}>
        <label htmlFor="notes" style={labelStyle}>
          Notes
        </label>
        <textarea
          id="notes"
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
          {isSubmitting ? 'Creating…' : 'Create Route'}
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
