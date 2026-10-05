/**
 * The Customer aggregate -- a Customer, its CustomerUsers (the people who sign
 * in to its portal) and its CustomerClosureBlocks (dates it's closed) -- as the
 * browser reads and writes it through the signed-in user's data client. The
 * server-side viewerSubs upkeep lives in lib/customerAccess.ts.
 *
 * Every function returns its data or throws a DataError (lib/graphqlResult.ts);
 * a Customer that doesn't exist is null.
 */
import { normalizeCustomerDefaults } from '@/lib/customerDefaults';
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';

/** Every Customer, paginated through to the end -- see lib/listAll.ts. */
export async function listAllCustomers() {
  return withDataError('Failed to load customers.', async () =>
    resultData(await listAll(getDataClient(), 'Customer')) ?? []
  );
}

/**
 * Fetch a specific customer by ID
 */
export async function getCustomer(customerId: string) {
  return withDataError('Failed to load customer.', async () =>
    resultData(await getDataClient().models.Customer.get({ id: customerId }))
  );
}

/**
 * Create a customer record.
 */
export async function createCustomer(input: {
  name: string;
  companyName?: string;
  email: string;
  contactPhone?: string;
  addressLine1?: string;
  standingInstructions?: string;
  defaultNumberOfSigns?: number;
  defaultAgentName?: string;
  defaultAgentInitials?: string;
  agentOptions?: string[];
  status?: 'active' | 'inactive' | 'suspended';
  billingRatePerHour: number;
}) {
  return withDataError('Failed to create customer.', async () =>
    resultData(await getDataClient().models.Customer.create(normalizeCustomerDefaults(input)))
  );
}

/**
 * Update an existing customer.
 */
export async function updateCustomer(
  customerId: string,
  updates: Partial<{
    name: string;
    companyName: string;
    email: string;
    contactPhone: string;
    addressLine1: string;
    standingInstructions: string;
    standingInstructionsUpdatedBy: string;
    standingInstructionsUpdatedAt: string;
    defaultNumberOfSigns: number;
    defaultAgentName: string;
    defaultAgentInitials: string;
    agentOptions: string[];
    status: 'active' | 'inactive' | 'suspended';
    billingRatePerHour: number;
    gstRegistered: boolean;
    gstAbn: string;
    directDebitAccountName: string;
    directDebitBsb: string;
    directDebitAccountNumber: string;
    directDebitAuthorizedAt: string;
    billingCycle: 'weekly' | 'fortnightly' | 'monthly';
    paymentTermsDays: number;
    groupLineItemsByAgent: boolean;
    autoSendInvoiceOnPeriodClose: boolean;
    gstExclusive: boolean;
    standingPickupDay: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    notifyOnLowSigns: boolean;
    sendMissingSignsReport: boolean;
    missingSignsReportEnabled: boolean;
    billingCcEmails: string[];
    attachAgentBreakdown: boolean;
    sendPaymentReminder: boolean;
    driverSplitPercent: number;
    driverSplitBasis: 'percentage_of_line_rate';
    hideDriverSplitFromCustomer: boolean;
    paySplitOnCompletedStopsOnly: boolean;
    restrictInvitesToOwnDomain: boolean;
  }>
) {
  return withDataError('Failed to update customer.', async () =>
    resultData(await getDataClient().models.Customer.update({ id: customerId, ...normalizeCustomerDefaults(updates) }))
  );
}

/**
 * List all CustomerUser records for a given customer.
 * Row-level authorization scopes what actually comes back: administrators see
 * every row; an account owner sees every row for their own customer; a
 * read_only user only sees their own row (see amplify/data/resource.ts).
 */
export async function listCustomerUsers(customerId: string) {
  return withDataError('Failed to load customer users.', async () =>
    resultData(await listAll(getDataClient(), 'CustomerUser', { filter: { customerId: { eq: customerId } } })) ?? []
  );
}

/**
 * List every CustomerUser record across all customers (unfiltered, paginated).
 * Only accessible by administrators -- used by the admin Users page's
 * all-customers access table.
 */
export async function listAllCustomerUsers() {
  return withDataError('Failed to load customer users.', async () =>
    resultData(await listAll(getDataClient(), 'CustomerUser')) ?? []
  );
}

export interface CustomerPortalContextResult {
  role: 'account_owner' | 'read_only';
  customerId: string;
}

/**
 * Resolve which Customer a signed-in Customer User belongs to, and their role.
 * Null when they aren't linked to any Customer. A failed read throws rather
 * than guessing: a guess could show owner screens to a read_only user.
 * Fallback behavior preserves legacy owner access where customerId === userSub.
 */
export async function getCustomerPortalContext(userSub: string): Promise<CustomerPortalContextResult | null> {
  return withDataError('Failed to load your account.', async () => {
    const rows =
      resultData(await listAll(getDataClient(), 'CustomerUser', { filter: { userSub: { eq: userSub } } })) ?? [];

    const ownerRow = rows.find((row) => row.role === 'account_owner' && row.customerId);
    if (ownerRow?.customerId) return { role: 'account_owner', customerId: ownerRow.customerId };

    const reviewerRow = rows.find((row) => row.role === 'read_only' && row.customerId);
    if (reviewerRow?.customerId) return { role: 'read_only', customerId: reviewerRow.customerId };

    // Legacy fallback: older records may still use sub as customerId.
    const legacyCustomer = resultData(await getDataClient().models.Customer.get({ id: userSub }));
    return legacyCustomer ? { role: 'account_owner', customerId: userSub } : null;
  });
}

/**
 * Create a CustomerUser record linking a Cognito user to a customer.
 * Only accessible by administrators.
 * accountOwnerSub must be the account owner's Cognito sub (same for all rows per customer).
 */
export async function createCustomerUser(input: {
  customerId: string;
  userSub: string;
  accountOwnerSub: string;
  role: 'account_owner' | 'read_only';
  name?: string;
  email?: string;
}) {
  return withDataError('Failed to create customer user.', async () =>
    resultData(await getDataClient().models.CustomerUser.create(input))
  );
}

/**
 * Update a CustomerUser record's display name and/or role.
 * Only accessible by administrators.
 */
export async function updateCustomerUser(input: {
  id: string;
  name?: string;
  role?: 'account_owner' | 'read_only';
  // Only passed when this update re-keys the denormalized owner sub after a
  // promotion -- see the comment on handleUpdateCustomerUser in
  // app/administrator/users/page.tsx.
  accountOwnerSub?: string;
}) {
  return withDataError('Failed to update customer user.', async () =>
    resultData(await getDataClient().models.CustomerUser.update(input))
  );
}

/**
 * Delete a CustomerUser record by ID.
 * Only accessible by administrators.
 */
export async function deleteCustomerUser(customerUserId: string) {
  return withDataError('Failed to remove customer user.', async () =>
    resultData(await getDataClient().models.CustomerUser.delete({ id: customerUserId }))
  );
}

/**
 * List agency-closure blocks for a customer
 */
export async function listCustomerClosureBlocks(customerId: string) {
  return withDataError('Failed to load closed dates.', async () =>
    resultData(await listAll(getDataClient(), 'CustomerClosureBlock', { filter: { customerId: { eq: customerId } } })) ??
    []
  );
}

/**
 * Create an agency-closure block (customer account_owner — blocks a date on their own calendar)
 */
export async function createCustomerClosureBlock(input: {
  customerId: string;
  date: string;
  reason?: string;
  createdByUserSub?: string;
  accountOwnerSub?: string;
  viewerSubs?: string[];
}) {
  return withDataError('Failed to save closed date.', async () =>
    resultData(await getDataClient().models.CustomerClosureBlock.create(input))
  );
}

/**
 * Delete an agency-closure block by ID
 */
export async function deleteCustomerClosureBlock(id: string) {
  return withDataError('Failed to remove closed date.', async () =>
    resultData(await getDataClient().models.CustomerClosureBlock.delete({ id }))
  );
}
