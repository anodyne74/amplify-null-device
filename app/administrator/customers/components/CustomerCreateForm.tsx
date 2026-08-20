import type { FormEvent } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import styles from '../page.module.css';

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
    <Card>
      <form onSubmit={onSubmit}>
        <div className={styles.formHeaderRow}>
          <h3 className={styles.formHeading}>Define Customer</h3>
          <Button type="button" variant="secondary" onClick={onToggleShowCreateForm}>
            {showCreateForm ? 'Hide Fields' : 'New Customer'}
          </Button>
        </div>
        {showCreateForm && (
          <>
            <p className={styles.formHint}>
              Create a new customer record for route and billing workflows. Required fields: Name, Email,
              Billing rate, Address.
            </p>
            <div className={styles.fieldsGrid}>
              <Field label="Name" htmlFor="create-customer-name">
                <Input
                  id="create-customer-name"
                  value={name}
                  onChange={(event) => onNameChange(event.target.value)}
                  placeholder="Name"
                  required
                />
              </Field>
              <Field label="Company Name" htmlFor="create-customer-company-name">
                <Input
                  id="create-customer-company-name"
                  value={companyName}
                  onChange={(event) => onCompanyNameChange(event.target.value)}
                  placeholder="Company Name"
                />
              </Field>
              <Field label="Email" htmlFor="create-customer-email">
                <Input
                  id="create-customer-email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="Email"
                  type="email"
                  required
                />
              </Field>
              <Field label="Billing rate per hour" htmlFor="create-customer-billing-rate">
                <Input
                  id="create-customer-billing-rate"
                  value={billingRatePerHour}
                  onChange={(event) => onBillingRatePerHourChange(event.target.value)}
                  placeholder="Billing rate per hour"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                />
              </Field>
              <Field label="Default number of signs" htmlFor="create-customer-default-signs">
                <Input
                  id="create-customer-default-signs"
                  value={defaultNumberOfSigns}
                  onChange={(event) => onDefaultNumberOfSignsChange(event.target.value)}
                  placeholder="Default number of signs"
                  type="number"
                  min={0}
                />
              </Field>
              <Field label="Default agent name" htmlFor="create-customer-agent-name">
                <Input
                  id="create-customer-agent-name"
                  value={defaultAgentName}
                  onChange={(event) => onDefaultAgentNameChange(event.target.value)}
                  placeholder="Default agent name"
                />
              </Field>
              <Field label="Default agent initials" htmlFor="create-customer-agent-initials">
                <Input
                  id="create-customer-agent-initials"
                  value={defaultAgentInitials}
                  onChange={(event) => onDefaultAgentInitialsChange(event.target.value)}
                  placeholder="Default agent initials (e.g., BO)"
                  maxLength={4}
                />
              </Field>
              <Field label="Address" htmlFor="create-customer-address">
                <AddressAutocompleteInput
                  id="create-customer-address"
                  value={addressLine1}
                  onChange={onAddressChange}
                  onResolved={onAddressResolved}
                  disabled={saving}
                  placeholder="Address"
                  className="nd-input"
                />
              </Field>
              <Field
                label="Agent options"
                htmlFor="create-customer-agent-options"
                hint="One option per line."
                className={styles.fieldsGridFull}
              >
                <Input
                  id="create-customer-agent-options"
                  value={agentOptionsText}
                  onChange={(event) => onAgentOptionsTextChange(event.target.value)}
                  placeholder="Agent options, one per line"
                  multiline
                />
              </Field>
              <Field
                label="Standing instructions"
                htmlFor="create-customer-standing-instructions"
                className={styles.fieldsGridFull}
              >
                <Input
                  id="create-customer-standing-instructions"
                  value={standingInstructions}
                  onChange={(event) => onStandingInstructionsChange(event.target.value)}
                  placeholder="Standing instructions for operators"
                  multiline
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={saving}>
              {saving ? 'Creating...' : 'Create Customer'}
            </Button>
          </>
        )}
      </form>
    </Card>
  );
}
