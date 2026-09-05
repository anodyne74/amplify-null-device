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
  onEditAddressLine1Change: (value: string) => void;
  onEditResolvedAddressChange: (resolved: ResolvedAddress | null) => void;
  onAddAgentOption: (value: string) => void;
  onRemoveAgentOption: (value: string) => void;
  onSetDefaultAgentOption: (value: string) => void;
  onEditStandingInstructionsChange: (value: string) => void;
  onEditRestrictInvitesToOwnDomainChange: (value: boolean) => void;
  onSave: () => void;
  onCancel: () => void;
  onSuspendToggle: () => void;
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
  onEditAddressLine1Change,
  onEditResolvedAddressChange,
  onAddAgentOption,
  onRemoveAgentOption,
  onSetDefaultAgentOption,
  onEditStandingInstructionsChange,
  onEditRestrictInvitesToOwnDomainChange,
  onSave,
  onCancel,
  onSuspendToggle,
}: CustomerEditPanelProps) {
  const isSuspended = editStatus === 'suspended';

  return (
    <Card
      title={`Configure — ${customer.name}`}
      subtitle="Account setup"
      footer={
        customer.standingInstructionsUpdatedAt ? (
          <span className={styles.attributionCaption}>
            Last edited{' '}
            {new Date(customer.standingInstructionsUpdatedAt).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            {customer.standingInstructionsUpdatedBy ? ` by ${customer.standingInstructionsUpdatedBy}` : ''}
          </span>
        ) : undefined
      }
    >
      {editError && <div className={styles.errorBanner} role="alert" aria-live="assertive">{editError}</div>}
      {editSuccess && <div className={styles.successBanner} role="status" aria-live="polite">{editSuccess}</div>}

      <div className={styles.detailGrid}>
        <div className={styles.detailColumn}>
          <p className={styles.mutedText}>Address is validated via Google address lookup before saving.</p>
          <div className={styles.fieldsGrid}>
            <Input
              value={editName}
              onChange={(event) => onEditNameChange(event.target.value)}
              placeholder="Customer Name"
              disabled={editSaving}
              required
            />
            <Input
              value={editCompanyName}
              onChange={(event) => onEditCompanyNameChange(event.target.value)}
              placeholder="Trading Name"
              disabled={editSaving}
            />
            <Input
              value={editContactPhone}
              onChange={(event) => onEditContactPhoneChange(event.target.value)}
              placeholder="Contact phone"
              type="tel"
              disabled={editSaving}
            />
            <Input
              value={editEmail}
              onChange={(event) => onEditEmailChange(event.target.value)}
              placeholder="Billing Email"
              type="email"
              disabled={editSaving}
              required
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
              {editSaving ? 'Saving...' : 'Save changes'}
            </Button>
            <Button type="button" variant="ghost" disabled={editSaving} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={editSaving}
              onClick={onSuspendToggle}
              className={styles.suspendAction}
              aria-label={`${isSuspended ? 'Reactivate' : 'Suspend'} account ${customer.name}`}
            >
              {isSuspended ? 'Reactivate account' : 'Suspend account'}
            </Button>
          </div>
        </div>

        <div className={styles.detailColumn}>
          <div>
            <h4 className={styles.subPanelHeading}>Standing instructions</h4>
            <p className={styles.mutedText}>Copied onto every route we build for this customer</p>
          </div>
          <div className={styles.fieldsGrid}>
            <div className={styles.fieldsGridFull}>
              <Input
                value={editStandingInstructions}
                onChange={(event) => onEditStandingInstructionsChange(event.target.value)}
                placeholder="Standing instructions for operators"
                disabled={editSaving}
                multiline
              />
            </div>
            <Input
              value={editDefaultNumberOfSigns}
              onChange={(event) => onEditDefaultNumberOfSignsChange(event.target.value)}
              placeholder="Default number of signs"
              type="number"
              min={0}
              disabled={editSaving}
            />
            <AgentOptionsEditor
              agentOptions={editAgentOptions}
              onAdd={onAddAgentOption}
              onRemove={onRemoveAgentOption}
              onSetDefault={onSetDefaultAgentOption}
              disabled={editSaving}
            />
          </div>

          <hr className={styles.detailDivider} />

          <h4 className={styles.subPanelHeading}>Onboarding checklist</h4>
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
        </div>
      </div>
    </Card>
  );
}
