'use client';

import { useState } from 'react';
import { generateAgentInitials, getAgentBadgeTone } from '@/lib/customerDefaults';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Checkbox } from '@/app/components/ui/forms/Checkbox';
import { Button } from '@/app/components/ui/core/Button';
import styles from './StopForm.module.css';
import { AddressAutocompleteInput, type ResolvedAddress } from './AddressAutocompleteInput';

interface StopFormProps {
  initialValues?: {
    address?: string;
    serviceType?: 'delivery' | 'pickup' | 'inspection';
    numberOfSigns?: number;
    agent?: string;
    isAuction?: boolean;
    notes?: string;
  };
  onSubmit: (values: {
    address: string;
    serviceType: 'delivery' | 'pickup' | 'inspection';
    numberOfSigns?: number;
    agent?: string;
    isAuction?: boolean;
    notes?: string;
    latitude?: number;
    longitude?: number;
    formattedAddress?: string;
  }) => Promise<void>;
  onCancel: () => void;
  addressSearchOrigin?: { latitude: number; longitude: number } | null;
  addressSearchRadiusMeters?: number;
  standingInstructions?: string;
  defaultNumberOfSigns?: number | null;
  availableAgents?: string[] | null;
  defaultAgentInitials?: string;
  isSubmitting?: boolean;
  error?: string | null;
  submitLabel?: string;
}

export function StopForm({
  initialValues,
  onSubmit,
  onCancel,
  addressSearchOrigin,
  addressSearchRadiusMeters,
  standingInstructions,
  defaultNumberOfSigns,
  availableAgents,
  defaultAgentInitials,
  isSubmitting,
  error,
  submitLabel = 'Add Stop',
}: StopFormProps) {
  const [address, setAddress] = useState(initialValues?.address || '');
  const [serviceType, setServiceType] = useState<'delivery' | 'pickup' | 'inspection'>(
    initialValues?.serviceType || 'delivery'
  );
  const [numberOfSigns, setNumberOfSigns] = useState(
    initialValues?.numberOfSigns?.toString() || defaultNumberOfSigns?.toString() || ''
  );
  const [agent, setAgent] = useState(initialValues?.agent || defaultAgentInitials || '');
  const [isAuction, setIsAuction] = useState(Boolean(initialValues?.isAuction));
  const [resolvedAddress, setResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [fieldErrors, setFieldErrors] = useState<{
    address?: string;
    numberOfSigns?: string;
  }>({});
  const agentOptions = Array.from(
    new Set(
      [
        ...(availableAgents ?? []),
        initialValues?.agent,
        defaultAgentInitials,
      ]
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  );

  const validateAddress = (value: string) =>
    value.trim() ? undefined : 'Address is required.';

  const validateNumberOfSigns = (value: string) => {
    if (!value.trim()) return undefined;
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      return 'Number of signs must be 0 or greater.';
    }
    return undefined;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Submit-time validation remains the final gate even with blur validation.
    const addressError = validateAddress(address);
    const numberOfSignsError = validateNumberOfSigns(numberOfSigns);
    setFieldErrors({ address: addressError, numberOfSigns: numberOfSignsError });
    if (addressError || numberOfSignsError) {
      return;
    }

    const parsedSigns = numberOfSigns.trim() ? parseInt(numberOfSigns, 10) : undefined;

    await onSubmit({
      address: address.trim(),
      serviceType,
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
      {error && (
        <div className={styles.errorBanner}>
          {error}
        </div>
      )}

      <div className={styles.field}>
        <Field label="Address" htmlFor="address" required>
          <AddressAutocompleteInput
            id="address"
            value={address}
            onChange={(val) => {
              setAddress(val);
              // Re-validate live once the field has been flagged, so the error
              // clears as soon as the input becomes valid.
              setFieldErrors((prev) =>
                prev.address ? { ...prev, address: validateAddress(val) } : prev
              );
            }}
            onResolved={(resolved) => {
              setResolvedAddress(resolved);
              if (resolved) setAddress(resolved.formattedAddress);
            }}
            onBlur={() =>
              setFieldErrors((prev) => ({ ...prev, address: validateAddress(address) }))
            }
            searchOrigin={addressSearchOrigin}
            searchRadiusMeters={addressSearchRadiusMeters}
            className="nd-input"
            disabled={isSubmitting}
            placeholder="Start typing an address…"
            ariaDescribedBy={fieldErrors.address ? 'address-error' : undefined}
            ariaInvalid={Boolean(fieldErrors.address)}
          />
        </Field>
        {fieldErrors.address && (
          <p id="address-error" className={styles.fieldError} role="alert">
            {fieldErrors.address}
          </p>
        )}
      </div>

      {standingInstructions && (
        <div className={styles.instructionsBox}>
          <div className={styles.instructionsLabel}>Standing Instructions</div>
          <p className={styles.instructionsText}>{standingInstructions}</p>
        </div>
      )}

      <div className={styles.field}>
        <Field label="Service Type" htmlFor="serviceType">
          <Select
            id="serviceType"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as 'delivery' | 'pickup' | 'inspection')}
            disabled={isSubmitting}
          >
            <option value="delivery">Delivery</option>
            <option value="pickup">Pickup</option>
            <option value="inspection">Inspection</option>
          </Select>
        </Field>
      </div>

      <div className={styles.field}>
        <Field label="Number of Signs" htmlFor="numberOfSigns">
          <Input
            id="numberOfSigns"
            type="number"
            min={0}
            value={numberOfSigns}
            onChange={(e) => {
              setNumberOfSigns(e.target.value);
              setFieldErrors((prev) =>
                prev.numberOfSigns
                  ? { ...prev, numberOfSigns: validateNumberOfSigns(e.target.value) }
                  : prev
              );
            }}
            onBlur={() =>
              setFieldErrors((prev) => ({
                ...prev,
                numberOfSigns: validateNumberOfSigns(numberOfSigns),
              }))
            }
            disabled={isSubmitting}
            placeholder="e.g. 4"
            aria-describedby={fieldErrors.numberOfSigns ? 'numberOfSigns-error' : undefined}
            aria-invalid={fieldErrors.numberOfSigns ? true : undefined}
          />
        </Field>
        {fieldErrors.numberOfSigns && (
          <p id="numberOfSigns-error" className={styles.fieldError} role="alert">
            {fieldErrors.numberOfSigns}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.agentLabel}>
          Listing Agent
        </span>
        {agentOptions.length > 0 ? (
          <div className={styles.agentBadgeGroup} role="radiogroup" aria-label="Listing Agent">
            {agentOptions.map((option) => {
              const selected = agent === option;
              const agentInitials = generateAgentInitials(option) ?? option.slice(0, 2).toUpperCase();
              return (
                <button
                  key={option}
                  type="button"
                  className={`${styles.agentBadge} ${agentInitials.length <= 2 ? styles.agentBadgeCircle : ''} ${selected ? styles.agentBadgeSelected : ''}`}
                  onClick={() => setAgent(selected ? '' : option)}
                  disabled={isSubmitting}
                  aria-pressed={selected}
                  aria-label={option}
                  title={option}
                  style={getAgentBadgeTone(option)}
                >
                  {agentInitials}
                </button>
              );
            })}
          </div>
        ) : (
          <p className={styles.agentHint}>No agent options configured for this customer yet.</p>
        )}
      </div>

      <div className={styles.field}>
        <Checkbox
          id="isAuction"
          checked={isAuction}
          onChange={(e) => setIsAuction(e.target.checked)}
          disabled={isSubmitting}
          label="Is Auction"
        />
      </div>

      <div className={styles.field}>
        <Field label="Notes" htmlFor="stopNotes">
          <Input
            id="stopNotes"
            multiline
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={isSubmitting}
            placeholder="Optional notes…"
          />
        </Field>
      </div>

      <div className={styles.actions}>
        <Button
          type="button"
          onClick={() => handleSubmit()}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving…' : submitLabel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
