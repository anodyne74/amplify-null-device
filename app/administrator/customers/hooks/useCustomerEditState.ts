import { useState } from 'react';
import type { ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import type { Customer, CustomerStatus } from '@/app/administrator/customers/types';
import {
  addAgentOption as addAgentOptionTo,
  moveAgentOption as moveAgentOptionIn,
  removeAgentOption as removeAgentOptionFrom,
} from '@/lib/customerDefaults';

interface OpenEditPanelParams {
  customer: Customer;
  billingRateDisplay: string;
  agentOptions: string[];
}

export function useCustomerEditState() {
  const [expandedEditPanel, setExpandedEditPanel] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editContactPhone, setEditContactPhone] = useState('');
  const [editBillingRatePerHour, setEditBillingRatePerHour] = useState('$0.00');
  const [editStatus, setEditStatus] = useState<CustomerStatus>('active');
  const [editAddressLine1, setEditAddressLine1] = useState('');
  const [editOriginalAddressLine1, setEditOriginalAddressLine1] = useState('');
  const [editStandingInstructions, setEditStandingInstructions] = useState('');
  const [editOriginalStandingInstructions, setEditOriginalStandingInstructions] = useState('');
  const [editDefaultNumberOfSigns, setEditDefaultNumberOfSigns] = useState('');
  const [editAgentOptions, setEditAgentOptions] = useState<string[]>([]);
  const [editRestrictInvitesToOwnDomain, setEditRestrictInvitesToOwnDomain] = useState(false);
  const [editResolvedAddress, setEditResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const addAgentOption = (value: string) => {
    setEditAgentOptions((prev) => addAgentOptionTo(prev, value));
  };

  const removeAgentOption = (value: string) => {
    setEditAgentOptions((prev) => removeAgentOptionFrom(prev, value));
  };

  const moveAgentOption = (index: number, direction: 'up' | 'down') => {
    setEditAgentOptions((prev) => moveAgentOptionIn(prev, index, direction));
  };

  const resetEditFeedback = () => {
    setEditError(null);
    setEditSuccess(null);
    setEditResolvedAddress(null);
  };

  const closeEditPanel = () => {
    setExpandedEditPanel(null);
    resetEditFeedback();
  };

  const openEditPanel = ({ customer, billingRateDisplay, agentOptions }: OpenEditPanelParams) => {
    setExpandedEditPanel(customer.id);
    resetEditFeedback();

    setEditName(customer.name);
    setEditCompanyName(customer.companyName ?? '');
    setEditEmail(customer.email);
    setEditContactPhone(customer.contactPhone ?? '');
    setEditBillingRatePerHour(billingRateDisplay);
    setEditStatus(customer.status ?? 'active');
    setEditAddressLine1(customer.addressLine1 ?? '');
    setEditOriginalAddressLine1(customer.addressLine1 ?? '');
    setEditStandingInstructions(customer.standingInstructions ?? '');
    setEditOriginalStandingInstructions(customer.standingInstructions ?? '');
    setEditDefaultNumberOfSigns(
      typeof customer.defaultNumberOfSigns === 'number' ? String(customer.defaultNumberOfSigns) : ''
    );
    setEditAgentOptions(agentOptions);
    setEditRestrictInvitesToOwnDomain(Boolean(customer.restrictInvitesToOwnDomain));
  };

  return {
    expandedEditPanel,
    setExpandedEditPanel,
    editName,
    setEditName,
    editCompanyName,
    setEditCompanyName,
    editEmail,
    setEditEmail,
    editContactPhone,
    setEditContactPhone,
    editBillingRatePerHour,
    setEditBillingRatePerHour,
    editStatus,
    setEditStatus,
    editAddressLine1,
    setEditAddressLine1,
    editOriginalAddressLine1,
    editStandingInstructions,
    setEditStandingInstructions,
    editOriginalStandingInstructions,
    editDefaultNumberOfSigns,
    setEditDefaultNumberOfSigns,
    editAgentOptions,
    setEditAgentOptions,
    addAgentOption,
    removeAgentOption,
    moveAgentOption,
    editRestrictInvitesToOwnDomain,
    setEditRestrictInvitesToOwnDomain,
    editResolvedAddress,
    setEditResolvedAddress,
    editSaving,
    setEditSaving,
    editError,
    setEditError,
    editSuccess,
    setEditSuccess,
    closeEditPanel,
    openEditPanel,
  };
}