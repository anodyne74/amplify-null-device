import type { FormEvent } from 'react';
import AdminActionButton from '@/app/components/AdminActionButton';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import styles from '@/app/dashboard.module.css';

interface CustomerCreateFormProps {
  showCreateForm: boolean;
  saving: boolean;
  name: string;
  companyName: string;
  email: string;
  billingRatePerHour: string;
  defaultNumberOfSigns: string;
  defaultAgentName: string;
  defaultAgentInitials: string;
  addressLine1: string;
  agentOptionsText: string;
  standingInstructions: string;
  onToggleShowCreateForm: () => void;
  onSubmit: (event: FormEvent) => void;
  onNameChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onBillingRatePerHourChange: (value: string) => void;
  onDefaultNumberOfSignsChange: (value: string) => void;
  onDefaultAgentNameChange: (value: string) => void;
  onDefaultAgentInitialsChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onAddressResolved: (resolved: ResolvedAddress | null) => void;
  onAgentOptionsTextChange: (value: string) => void;
  onStandingInstructionsChange: (value: string) => void;
}

export default function CustomerCreateForm({
  showCreateForm,
  saving,
  name,
  companyName,
  email,
  billingRatePerHour,
  defaultNumberOfSigns,
  defaultAgentName,
  defaultAgentInitials,
  addressLine1,
  agentOptionsText,
  standingInstructions,
  onToggleShowCreateForm,
  onSubmit,
  onNameChange,
  onCompanyNameChange,
  onEmailChange,
  onBillingRatePerHourChange,
  onDefaultNumberOfSignsChange,
  onDefaultAgentNameChange,
  onDefaultAgentInitialsChange,
  onAddressChange,
  onAddressResolved,
  onAgentOptionsTextChange,
  onStandingInstructionsChange,
}: CustomerCreateFormProps) {
  return (
    <form className={styles.infoPanel} onSubmit={onSubmit}>
      <div className={styles.sectionHeaderRow}>
        <h3>Define Customer</h3>
        <AdminActionButton
          onClick={onToggleShowCreateForm}
          variant="secondary"
        >
          {showCreateForm ? 'Hide Fields' : 'New Customer'}
        </AdminActionButton>
      </div>
      {showCreateForm && (
        <>
          <p className={styles.welcome}>Create a new customer record for route and billing workflows.</p>
          <p className={styles.fieldHint}>Required fields: Name, Email, Billing rate, Address.</p>
          <div className={styles.stackedFields}>
            <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="Name" required />
            <input
              value={companyName}
              onChange={(event) => onCompanyNameChange(event.target.value)}
              placeholder="Company Name"
            />
            <input
              value={email}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="Email"
              type="email"
              required
            />
            <input
              value={billingRatePerHour}
              onChange={(event) => onBillingRatePerHourChange(event.target.value)}
              placeholder="Billing rate per hour"
              type="number"
              min={0}
              step="0.01"
              required
            />
            <input
              value={defaultNumberOfSigns}
              onChange={(event) => onDefaultNumberOfSignsChange(event.target.value)}
              placeholder="Default number of signs"
              type="number"
              min={0}
            />
            <input
              value={defaultAgentName}
              onChange={(event) => onDefaultAgentNameChange(event.target.value)}
              placeholder="Default agent name"
            />
            <input
              value={defaultAgentInitials}
              onChange={(event) => onDefaultAgentInitialsChange(event.target.value)}
              placeholder="Default agent initials (e.g., BO)"
              maxLength={4}
            />
            <AddressAutocompleteInput
              id="create-customer-address"
              value={addressLine1}
              onChange={onAddressChange}
              onResolved={onAddressResolved}
              disabled={saving}
              placeholder="Address"
              className={styles.input}
            />
            <textarea
              value={agentOptionsText}
              onChange={(event) => onAgentOptionsTextChange(event.target.value)}
              placeholder="Agent options, one per line"
            />
            <textarea
              value={standingInstructions}
              onChange={(event) => onStandingInstructionsChange(event.target.value)}
              placeholder="Standing instructions for operators"
            />
            <AdminActionButton type="submit" variant="primary" isLoading={saving} loadingLabel="Creating...">
              Create Customer
            </AdminActionButton>
          </div>
        </>
      )}
    </form>
  );
}