import AdminActionButton from '@/app/components/AdminActionButton';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import type { Customer, CustomerStatus } from '@/app/administrator/customers/types';
import styles from '@/app/dashboard.module.css';

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
  onSave,
  onCancel,
}: CustomerEditPanelProps) {
  return (
    <div className={styles.infoPanel}>
      <h4>Edit Customer — {customer.name}</h4>
      {editError && (
        <p className={styles.inlineErrorText} role="alert" aria-live="assertive">
          {editError}
        </p>
      )}
      {editSuccess && (
        <p className={styles.inlineSuccessText} role="status" aria-live="polite">
          {editSuccess}
        </p>
      )}
      <p className={styles.welcome}>Address is validated via Google address lookup before saving.</p>
      <div className={styles.twoColumnGrid}>
        <input
          value={editName}
          onChange={(event) => onEditNameChange(event.target.value)}
          placeholder="Name"
          disabled={editSaving}
          required
        />
        <input
          value={editCompanyName}
          onChange={(event) => onEditCompanyNameChange(event.target.value)}
          placeholder="Company Name"
          disabled={editSaving}
        />
        <input
          value={editEmail}
          onChange={(event) => onEditEmailChange(event.target.value)}
          placeholder="Correspondence Email"
          type="email"
          disabled={editSaving}
          required
        />
        <input
          value={editBillingRatePerHour}
          onChange={(event) => onEditBillingRatePerHourChange(event.target.value)}
          onBlur={(event) => onEditBillingRatePerHourBlur(event.target.value)}
          placeholder="Billing rate per hour"
          type="text"
          inputMode="decimal"
          disabled={editSaving}
          required
        />
        <select
          value={editStatus}
          onChange={(event) => onEditStatusChange(event.target.value as CustomerStatus)}
          disabled={editSaving}
        >
          <option value="active">active</option>
          <option value="inactive">inactive</option>
          <option value="suspended">suspended</option>
        </select>
        <input
          value={editDefaultNumberOfSigns}
          onChange={(event) => onEditDefaultNumberOfSignsChange(event.target.value)}
          placeholder="Default number of signs"
          type="number"
          min={0}
          disabled={editSaving}
        />
        <input
          value={editDefaultAgentName}
          onChange={(event) => onEditDefaultAgentNameChange(event.target.value)}
          placeholder="Default agent name"
          disabled={editSaving}
        />
        <input
          value={editDefaultAgentInitials}
          onChange={(event) => onEditDefaultAgentInitialsChange(event.target.value)}
          placeholder="Default agent initials (e.g., BO)"
          maxLength={4}
          disabled={editSaving}
        />
        <div className={styles.fullWidth}>
          <AddressAutocompleteInput
            id={`customer-address-${customer.id}`}
            value={editAddressLine1}
            onChange={(value) => {
              onEditAddressLine1Change(value);
            }}
            onResolved={onEditResolvedAddressChange}
            disabled={editSaving}
            placeholder="Address"
            className={styles.input}
          />
        </div>
        <textarea
          value={editAgentOptionsText}
          onChange={(event) => onEditAgentOptionsTextChange(event.target.value)}
          placeholder="Agent options, one per line"
          disabled={editSaving}
          className={styles.fullWidth}
        />
        <textarea
          value={editStandingInstructions}
          onChange={(event) => onEditStandingInstructionsChange(event.target.value)}
          placeholder="Standing instructions for operators"
          disabled={editSaving}
          className={styles.fullWidth}
        />
        {customer.defaultAgentInitials && (
          <p className={`${styles.welcome} ${styles.fullWidth}`}>
            Current default initials: {customer.defaultAgentInitials}
          </p>
        )}
      </div>
      <div className={styles.actionsRow}>
        <AdminActionButton
          onClick={onSave}
          variant="primary"
          isLoading={editSaving}
          loadingLabel="Saving..."
        >
          Save Customer
        </AdminActionButton>
        <AdminActionButton
          onClick={onCancel}
          variant="ghost"
          disabled={editSaving}
        >
          Cancel
        </AdminActionButton>
      </div>
    </div>
  );
}