import { Button } from '@/app/components/ui/core/Button';
import { Card } from '@/app/components/ui/core/Card';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { Checkbox } from '@/app/components/ui/forms/Checkbox';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import AgentOptionsEditor from '@/app/administrator/customers/components/AgentOptionsEditor';
import type { Customer, CustomerStatus } from '@/app/administrator/customers/types';
import type { ChecklistItem } from '@/lib/customerOnboardingChecklist';
import styles from '../page.module.css';

function emailDomain(email: string) {
  return email.split('@')[1]?.trim() || 'their domain';
}

interface CustomerEditPanelProps {
  customer: Customer;
  editName: string;
  editCompanyName: string;
  editEmail: string;
  editContactPhone: string;
  editBillingRatePerHour: string;
  editStatus: CustomerStatus;
  editAddressLine1: string;
  editStandingInstructions: string;
  editDefaultNumberOfSigns: string;
  editDefaultAgentInitials: string;
  editAgentOptions: string[];
  editRestrictInvitesToOwnDomain: boolean;
  editSaving: boolean;
  editError: string | null;
  editSuccess: string | null;
  checklist?: ChecklistItem[];
  checklistLoading?: boolean;
  onEditNameChange: (value: string) => void;
  onEditCompanyNameChange: (value: string) => void;
  onEditEmailChange: (value: string) => void;
  onEditContactPhoneChange: (value: string) => void;
  onEditBillingRatePerHourChange: (value: string) => void;
  onEditBillingRatePerHourBlur: (value: string) => void;
  onEditStatusChange: (value: CustomerStatus) => void;
  onEditDefaultNumberOfSignsChange: (value: string) => void;
  onEditDefaultAgentInitialsChange: (value: string) => void;
  onEditAddressLine1Change: (value: string) => void;
  onEditResolvedAddressChange: (resolved: ResolvedAddress | null) => void;
  onAddAgentOption: (value: string) => void;
  onRemoveAgentOption: (value: string) => void;
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
  editContactPhone,
  editBillingRatePerHour,
  editStatus,
  editAddressLine1,
  editStandingInstructions,
  editDefaultNumberOfSigns,
  editDefaultAgentInitials,
  editAgentOptions,
  editRestrictInvitesToOwnDomain,
  editSaving,
  editError,
  editSuccess,
  checklist,
  checklistLoading,
  onEditNameChange,
  onEditCompanyNameChange,
  onEditEmailChange,
  onEditContactPhoneChange,
  onEditBillingRatePerHourChange,
  onEditBillingRatePerHourBlur,
  onEditStatusChange,
  onEditDefaultNumberOfSignsChange,
  onEditDefaultAgentInitialsChange,
  onEditAddressLine1Change,
  onEditResolvedAddressChange,
  onAddAgentOption,
  onRemoveAgentOption,
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
          value={editContactPhone}
          onChange={(event) => onEditContactPhoneChange(event.target.value)}
          placeholder="Contact phone"
          type="tel"
          disabled={editSaving}
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
        <AgentOptionsEditor
          agentOptions={editAgentOptions}
          onAdd={onAddAgentOption}
          onRemove={onRemoveAgentOption}
          disabled={editSaving}
        />
        <div className={styles.fieldsGridFull}>
          <Input
            value={editStandingInstructions}
            onChange={(event) => onEditStandingInstructionsChange(event.target.value)}
            placeholder="Standing instructions for operators"
            disabled={editSaving}
            multiline
          />
          {customer.standingInstructionsUpdatedAt && (
            <div className={styles.attributionRow}>
              <span className={styles.attributionCaption}>
                Last edited {new Date(customer.standingInstructionsUpdatedAt).toLocaleDateString('en-AU', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {customer.standingInstructionsUpdatedBy ? ` by ${customer.standingInstructionsUpdatedBy}` : ''}
              </span>
            </div>
          )}
        </div>
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

      <Card title="Onboarding checklist" className={styles.checklistCard}>
        {checklistLoading ? (
          <p className={styles.mutedText}>Loading...</p>
        ) : (
          <ul className={styles.checklist}>
            {(checklist ?? []).map((item) => (
              <li key={item.id} className={styles.checklistRow}>
                <span
                  className={`${styles.checklistMark} ${item.done ? styles.checklistMarkDone : styles.checklistMarkPending}`}
                  aria-hidden="true"
                >
                  {item.done ? '✓' : '·'}
                </span>
                <span className={styles.checklistLabel}>{item.label}</span>
                {item.when && <span className={styles.checklistWhen}>{item.when}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
