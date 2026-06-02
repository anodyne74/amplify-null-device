import { useState } from 'react';
import type { CustomerUser } from '@/app/administrator/customers/types';

export function useCustomerOwnerState() {
  const [expandedOwnerPanel, setExpandedOwnerPanel] = useState<string | null>(null);
  const [customerUsers, setCustomerUsers] = useState<Record<string, CustomerUser[]>>({});
  const [ownerUserSub, setOwnerUserSub] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerSaving, setOwnerSaving] = useState(false);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [ownerSuccess, setOwnerSuccess] = useState<string | null>(null);

  const resetOwnerSelection = () => {
    setOwnerUserSub('');
    setOwnerName('');
    setOwnerEmail('');
  };

  const resetOwnerFeedback = () => {
    setOwnerError(null);
    setOwnerSuccess(null);
  };

  const closeOwnerPanel = () => {
    setExpandedOwnerPanel(null);
  };

  const openOwnerPanel = (customerId: string) => {
    setExpandedOwnerPanel(customerId);
    resetOwnerFeedback();
    resetOwnerSelection();
  };

  const selectOwnerUserSub = (selectedUserSub: string, usersForCustomer: CustomerUser[]) => {
    setOwnerUserSub(selectedUserSub);
    const selectedUser = usersForCustomer.find((user) => user.userSub === selectedUserSub);
    if (selectedUser) {
      setOwnerName(selectedUser.name ?? '');
      setOwnerEmail(selectedUser.email ?? '');
    }
  };

  return {
    expandedOwnerPanel,
    setExpandedOwnerPanel,
    customerUsers,
    setCustomerUsers,
    ownerUserSub,
    setOwnerUserSub,
    ownerName,
    setOwnerName,
    ownerEmail,
    setOwnerEmail,
    ownerSaving,
    setOwnerSaving,
    ownerError,
    setOwnerError,
    ownerSuccess,
    setOwnerSuccess,
    resetOwnerSelection,
    resetOwnerFeedback,
    closeOwnerPanel,
    openOwnerPanel,
    selectOwnerUserSub,
  };
}