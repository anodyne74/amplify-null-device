import type { FormEvent } from 'react';
import AdminActionButton from '@/app/components/AdminActionButton';
import AdminFormField from '@/app/components/AdminFormField';
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
            <AdminFormField label="Name" htmlFor="create-customer-name" className={styles.inlineGrid}>
              <input
                id="create-customer-name"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                placeholder="Name"
                required
              />
            </AdminFormField>
            <AdminFormField label="Company Name" htmlFor="create-customer-company-name" className={styles.inlineGrid}>
              <input
                id="create-customer-company-name"
                value={companyName}
                onChange={(event) => onCompanyNameChange(event.target.value)}
                placeholder="Company Name"
              />
            </AdminFormField>
            <AdminFormField label="Email" htmlFor="create-customer-email" className={styles.inlineGrid}>
              <input
                id="create-customer-email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="Email"
                type="email"
                required
              />
            </AdminFormField>
            <AdminFormField label="Billing rate per hour" htmlFor="create-customer-billing-rate" className={styles.inlineGrid}>
              <input
                id="create-customer-billing-rate"
                value={billingRatePerHour}
                onChange={(event) => onBillingRatePerHourChange(event.target.value)}
                placeholder="Billing rate per hour"
                type="number"
                min={0}
                step="0.01"
                required
              />
            </AdminFormField>
            <AdminFormField label="Default number of signs" htmlFor="create-customer-default-signs" className={styles.inlineGrid}>
              <input
                id="create-customer-default-signs"
                value={defaultNumberOfSigns}
                onChange={(event) => onDefaultNumberOfSignsChange(event.target.value)}
                placeholder="Default number of signs"
                type="number"
                min={0}
              />
            </AdminFormField>
            <AdminFormField label="Default agent name" htmlFor="create-customer-agent-name" className={styles.inlineGrid}>
              <input
                id="create-customer-agent-name"
                value={defaultAgentName}
                onChange={(event) => onDefaultAgentNameChange(event.target.value)}
                placeholder="Default agent name"
              />
            </AdminFormField>
            <AdminFormField label="Default agent initials" htmlFor="create-customer-agent-initials" className={styles.inlineGrid}>
              <input
                id="create-customer-agent-initials"
                value={defaultAgentInitials}
                onChange={(event) => onDefaultAgentInitialsChange(event.target.value)}
                placeholder="Default agent initials (e.g., BO)"
                maxLength={4}
              />
            </AdminFormField>
            <AdminFormField label="Address" htmlFor="create-customer-address" className={styles.inlineGrid}>
              <AddressAutocompleteInput
                id="create-customer-address"
                value={addressLine1}
                onChange={onAddressChange}
                onResolved={onAddressResolved}
                disabled={saving}
                placeholder="Address"
                className={styles.input}
              />
            </AdminFormField>
            <AdminFormField label="Agent options" htmlFor="create-customer-agent-options" className={styles.inlineGrid} hint="One option per line.">
              <textarea
                id="create-customer-agent-options"
                value={agentOptionsText}
                onChange={(event) => onAgentOptionsTextChange(event.target.value)}
                placeholder="Agent options, one per line"
              />
            </AdminFormField>
            <AdminFormField label="Standing instructions" htmlFor="create-customer-standing-instructions" className={styles.inlineGrid}>
              <textarea
                id="create-customer-standing-instructions"
                value={standingInstructions}
                onChange={(event) => onStandingInstructionsChange(event.target.value)}
                placeholder="Standing instructions for operators"
              />
            </AdminFormField>
            <AdminActionButton type="submit" variant="primary" isLoading={saving} loadingLabel="Creating...">
              Create Customer
            </AdminActionButton>
          </div>
        </>
      )}
    </form>
  );
}