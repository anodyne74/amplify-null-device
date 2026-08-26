import { Button } from '@/app/components/ui/core/Button';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Checkbox } from '@/app/components/ui/forms/Checkbox';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import type { Customer, CustomerStatus } from '@/app/administrator/customers/types';
import styles from '../page.module.css';

function emailDomain(email: string) {
  return email.split('@')[1]?.trim() || 'their domain';
}

interface CustomerEditPanelProps {
  customer: Customer;
  editName: string;
  editCompanyName: string;
  editEmail: string;
  editBillingRatePerHour: string;
  editStatus: CustomerStatus;
  editAddressLine1: string;
  editStandingInstructions: string;
  editDefaultNumberOfSigns: string;
  editDefaultAgentName: string;
  editDefaultAgentInitials: string;
  editAgentOptionsText: string;
  editRestrictInvitesToOwnDomain: boolean;
  editSaving: boolean;
  editError: string | null;
  editSuccess: string | null;
  onEditNameChange: (value: string) => void;
  onEditCompanyNameChange: (value: string) => void;
  onEditEmailChange: (value: string) => void;
  onEditBillingRatePerHourChange: (value: string) => void;
  onEditBillingRatePerHourBlur: (value: string) => void;
  onEditStatusChange: (value: CustomerStatus) => void;
  onEditDefaultNumberOfSignsChange: (value: string) => void;
  onEditDefaultAgentNameChange: (value: string) => void;
  onEditDefaultAgentInitialsChange: (value: string) => void;
  onEditAddressLine1Change: (value: string) => void;
  onEditResolvedAddressChange: (resolved: ResolvedAddress | null) => void;
  onEditAgentOptionsTextChange: (value: string) => void;
  onEditStandingInstructionsChange: (value: string) => void;
  onEditRestrictInvitesToOwnDomainChange: (value: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
}

export default function CustomerEditPanel({
  customer,
  editName,
  editCompanyName,
  editEmail,
  editBillingRatePerHour,
  editStatus,
  editAddressLine1,
  editStandingInstructions,
  editDefaultNumberOfSigns,
  editDefaultAgentName,
  editDefaultAgentInitials,
  editAgentOptionsText,
  editRestrictInvitesToOwnDomain,
  editSaving,
  editError,
  editSuccess,
  onEditNameChange,
  onEditCompanyNameChange,
  onEditEmailChange,
  onEditBillingRatePerHourChange,
  onEditBillingRatePerHourBlur,
  onEditStatusChange,
  onEditDefaultNumberOfSignsChange,
  onEditDefaultAgentNameChange,
  onEditDefaultAgentInitialsChange,
  onEditAddressLine1Change,
  onEditResolvedAddressChange,
  onEditAgentOptionsTextChange,
  onEditStandingInstructionsChange,
  onEditRestrictInvitesToOwnDomainChange,
  onSave,
  onCancel,
}: CustomerEditPanelProps) {
  return (
    <div className={styles.subPanel}>
      <h4 className={styles.subPanelHeading}>Edit Customer — {customer.name}</h4>
      {editError && <div className={styles.errorBanner} role="alert" aria-live="assertive">{editError}</div>}
      {editSuccess && <div className={styles.successBanner} role="status" aria-live="polite">{editSuccess}</div>}
      <p className={styles.mutedText}>Address is validated via Google address lookup before saving.</p>
      <div className={styles.fieldsGrid}>
        <Input
          value={editName}
          onChange={(event) => onEditNameChange(event.target.value)}
          placeholder="Name"
          disabled={editSaving}
          required
        />
        <Input
          value={editCompanyName}
          onChange={(event) => onEditCompanyNameChange(event.target.value)}
          placeholder="Company Name"
          disabled={editSaving}
        />
        <Input
          value={editEmail}
          onChange={(event) => onEditEmailChange(event.target.value)}
          placeholder="Correspondence Email"
          type="email"
          disabled={editSaving}
          required
        />
        <Input
          value={editBillingRatePerHour}
          onChange={(event) => onEditBillingRatePerHourChange(event.target.value)}
          onBlur={(event) => onEditBillingRatePerHourBlur(event.target.value)}
          placeholder="Billing rate per hour"
          type="text"
          inputMode="decimal"
          disabled={editSaving}
          required
        />
        <Select
          value={editStatus}
          onChange={(event) => onEditStatusChange(event.target.value as CustomerStatus)}
          disabled={editSaving}
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="suspended">suspended</option>
        </Select>
        <Input
          value={editDefaultNumberOfSigns}
          onChange={(event) => onEditDefaultNumberOfSignsChange(event.target.value)}
          placeholder="Default number of signs"
          type="number"
          min={0}
          disabled={editSaving}
        />
        <Input
          value={editDefaultAgentName}
          onChange={(event) => onEditDefaultAgentNameChange(event.target.value)}
          placeholder="Default agent name"
          disabled={editSaving}
        />
        <Input
          value={editDefaultAgentInitials}
          onChange={(event) => onEditDefaultAgentInitialsChange(event.target.value)}
          placeholder="Default agent initials (e.g., BO)"
          maxLength={4}
          disabled={editSaving}
        />
        <div className={styles.fieldsGridFull}>
          <AddressAutocompleteInput
            id={`customer-address-${customer.id}`}
            value={editAddressLine1}
            onChange={(value) => {
              onEditAddressLine1Change(value);
            }}
            onResolved={onEditResolvedAddressChange}
            disabled={editSaving}
            placeholder="Address"
            className="nd-input"
          />
        </div>
        <Input
          value={editAgentOptionsText}
          onChange={(event) => onEditAgentOptionsTextChange(event.target.value)}
          placeholder="Agent options, one per line"
          disabled={editSaving}
          multiline
          className={styles.fieldsGridFull}
        />
        <Input
          value={editStandingInstructions}
          onChange={(event) => onEditStandingInstructionsChange(event.target.value)}
          placeholder="Standing instructions for operators"
          disabled={editSaving}
          multiline
          className={styles.fieldsGridFull}
        />
        {customer.defaultAgentInitials && (
          <p className={`${styles.mutedText} ${styles.fieldsGridFull}`}>
            Current default initials: {customer.defaultAgentInitials}
          </p>
        )}
        <Checkbox
          className={styles.fieldsGridFull}
          checked={editRestrictInvitesToOwnDomain}
          onChange={(event) => onEditRestrictInvitesToOwnDomainChange(event.target.checked)}
          disabled={editSaving}
          label={`Restrict invited users to @${emailDomain(editEmail || customer.email)} email addresses`}
          description="When on, this customer's account owner can only invite teammates whose email matches this domain."
        />
      </div>
      <div className={styles.actionsRow}>
        <Button type="button" variant="primary" loading={editSaving} onClick={onSave}>
          {editSaving ? 'Saving...' : 'Save Customer'}
        </Button>
        <Button type="button" variant="ghost" disabled={editSaving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
