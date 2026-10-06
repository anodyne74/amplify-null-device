import type { FormEvent } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import AgentOptionsEditor from '@/app/administrator/customers/components/AgentOptionsEditor';
import styles from '../page.module.css';

interface CustomerCreateFormProps {
  saving: boolean;
  name: string;
  companyName: string;
  email: string;
  billingRatePerHour: string;
  defaultNumberOfSigns: string;
  addressLine1: string;
  agentOptions: string[];
  standingInstructions: string;
  onSubmit: (event: FormEvent) => void;
  onNameChange: (value: string) => void;
  onCompanyNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onBillingRatePerHourChange: (value: string) => void;
  onDefaultNumberOfSignsChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onAddressResolved: (resolved: ResolvedAddress | null) => void;
  onAddAgentOption: (value: string) => void;
  onRemoveAgentOption: (value: string) => void;
  onSetDefaultAgentOption: (value: string) => void;
  onStandingInstructionsChange: (value: string) => void;
}

export default function CustomerCreateForm({
  saving,
  name,
  companyName,
  email,
  billingRatePerHour,
  defaultNumberOfSigns,
  addressLine1,
  agentOptions,
  standingInstructions,
  onSubmit,
  onNameChange,
  onCompanyNameChange,
  onEmailChange,
  onBillingRatePerHourChange,
  onDefaultNumberOfSignsChange,
  onAddressChange,
  onAddressResolved,
  onAddAgentOption,
  onRemoveAgentOption,
  onSetDefaultAgentOption,
  onStandingInstructionsChange,
}: CustomerCreateFormProps) {
  return (
    <Card title="Define Customer">
      <form onSubmit={onSubmit}>
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
          <AgentOptionsEditor
            agentOptions={agentOptions}
            onAdd={onAddAgentOption}
            onRemove={onRemoveAgentOption}
            onSetDefault={onSetDefaultAgentOption}
            disabled={saving}
          />
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
      </form>
    </Card>
  );
}
