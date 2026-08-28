export type CustomerStatus = 'active' | 'inactive' | 'suspended';

export type Customer = {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
  contactPhone?: string | null;
  billingRatePerHour: number;
  status?: CustomerStatus | null;
  addressLine1?: string | null;
  standingInstructions?: string | null;
  standingInstructionsUpdatedBy?: string | null;
  standingInstructionsUpdatedAt?: string | null;
  defaultNumberOfSigns?: number | null;
  defaultAgentName?: string | null;
  defaultAgentInitials?: string | null;
  agentOptions?: string[] | null;
  restrictInvitesToOwnDomain?: boolean | null;
};

export type CustomerUser = {
  id: string;
  customerId: string;
  userSub: string;
  accountOwnerSub: string;
  name?: string | null;
  email?: string | null;
  role?: 'account_owner' | 'read_only' | null;
  createdAt?: string | null;
};