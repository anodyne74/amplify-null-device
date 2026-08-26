import { useState } from 'react';
import type { ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import type { Customer, CustomerStatus } from '@/app/administrator/customers/types';

interface OpenEditPanelParams {
  customer: Customer;
  billingRateDisplay: string;
  agentOptionsText: string;
}

export function useCustomerEditState() {
  const [expandedEditPanel, setExpandedEditPanel] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editBillingRatePerHour, setEditBillingRatePerHour] = useState('$0.00');
  const [editStatus, setEditStatus] = useState<CustomerStatus>('active');
  const [editAddressLine1, setEditAddressLine1] = useState('');
  const [editOriginalAddressLine1, setEditOriginalAddressLine1] = useState('');
  const [editStandingInstructions, setEditStandingInstructions] = useState('');
  const [editDefaultNumberOfSigns, setEditDefaultNumberOfSigns] = useState('');
  const [editDefaultAgentName, setEditDefaultAgentName] = useState('');
  const [editDefaultAgentInitials, setEditDefaultAgentInitials] = useState('');
  const [editAgentOptionsText, setEditAgentOptionsText] = useState('');
  const [editRestrictInvitesToOwnDomain, setEditRestrictInvitesToOwnDomain] = useState(false);
  const [editResolvedAddress, setEditResolvedAddress] = useState<ResolvedAddress | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);

  const resetEditFeedback = () => {
    setEditError(null);
    setEditSuccess(null);
    setEditResolvedAddress(null);
  };

  const closeEditPanel = () => {
    setExpandedEditPanel(null);
    resetEditFeedback();
  };

  const openEditPanel = ({ customer, billingRateDisplay, agentOptionsText }: OpenEditPanelParams) => {
    setExpandedEditPanel(customer.id);
    resetEditFeedback();

    setEditName(customer.name);
    setEditCompanyName(customer.companyName ?? '');
    setEditEmail(customer.email);
    setEditBillingRatePerHour(billingRateDisplay);
    setEditStatus(customer.status ?? 'active');
    setEditAddressLine1(customer.addressLine1 ?? '');
    setEditOriginalAddressLine1(customer.addressLine1 ?? '');
    setEditStandingInstructions(customer.standingInstructions ?? '');
    setEditDefaultNumberOfSigns(
      typeof customer.defaultNumberOfSigns === 'number' ? String(customer.defaultNumberOfSigns) : ''
    );
    setEditDefaultAgentName(customer.defaultAgentName ?? '');
    setEditDefaultAgentInitials(customer.defaultAgentInitials ?? '');
    setEditAgentOptionsText(agentOptionsText);
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
    editBillingRatePerHour,
    setEditBillingRatePerHour,
    editStatus,
    setEditStatus,
    editAddressLine1,
    setEditAddressLine1,
    editOriginalAddressLine1,
    editStandingInstructions,
    setEditStandingInstructions,
    editDefaultNumberOfSigns,
    setEditDefaultNumberOfSigns,
    editDefaultAgentName,
    setEditDefaultAgentName,
    editDefaultAgentInitials,
    setEditDefaultAgentInitials,
    editAgentOptionsText,
    setEditAgentOptionsText,
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