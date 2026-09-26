/**
 * The Customer aggregate -- a Customer, its CustomerUsers (the people who sign
 * in to its portal) and its CustomerClosureBlocks (dates it's closed) -- as the
 * browser reads and writes it through the signed-in user's data client. The
 * server-side viewerSubs upkeep lives in lib/customerAccess.ts.
 */
import { normalizeCustomerDefaults } from '@/lib/customerDefaults';
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';

/** Every Customer, paginated through to the end -- see lib/listAll.ts. */
export async function listAllCustomers() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'Customer');

    if (errors.length > 0) {
      console.error('Errors fetching customers:', errors);
      return { data: [], errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing all customers:', error);
    return { data: [], errors: [error as Error] };
  }
}

/**
 * Fetch a specific customer by ID
 */
export async function getCustomer(customerId: string) {
  try {
    const { data, errors } = await getDataClient().models.Customer.get({ id: customerId });
    if (errors) {
      console.error('Errors fetching customer:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error getting customer:', error);
    return { data: null, errors: [error] };
  }
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
  try {
    const { data, errors } = await getDataClient().models.Customer.create(normalizeCustomerDefaults(input));

    if (errors) {
      console.error('Errors creating customer:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating customer:', error);
    return { data: null, errors: [error] };
  }
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
  try {
    const { data, errors } = await getDataClient().models.Customer.update({
      id: customerId,
      ...normalizeCustomerDefaults(updates),
    });

    if (errors) {
      console.error('Errors updating customer:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error updating customer:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * List all CustomerUser records for a given customer.
 * Row-level authorization scopes what actually comes back: administrators see
 * every row; an account owner sees every row for their own customer; a
 * read_only user only sees their own row (see amplify/data/resource.ts).
 */
export async function listCustomerUsers(customerId: string) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'CustomerUser', {
      filter: { customerId: { eq: customerId } },
    });
    if (errors.length > 0) {
      console.error('Errors listing customer users:', errors);
      return { data, errors };
    }
    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing customer users:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * List every CustomerUser record across all customers (unfiltered, paginated).
 * Only accessible by administrators -- used by the admin Users page's
 * all-customers access table.
 */
export async function listAllCustomerUsers() {
  try {
    const { data, errors } = await listAll(getDataClient(), 'CustomerUser');
    if (errors.length > 0) {
      console.error('Errors listing all customer users:', errors);
      return { data, errors };
    }
    return { data, errors: undefined };
  } catch (error) {
    console.error('Error listing all customer users:', error);
    return { data: [], errors: [error] };
  }
}

/**
 * Resolve customer portal context for a user sub.
 * Fallback behavior preserves legacy owner access where customerId === userSub.
 */
export async function getCustomerPortalContext(userSub: string): Promise<{
  role: 'account_owner' | 'read_only';
  customerId: string;
  errors?: unknown[];
}> {
  try {
    const { data: rows, errors: listErrors } = await listAll(getDataClient(), 'CustomerUser', {
      filter: { userSub: { eq: userSub } },
    });
    const errors = listErrors.length > 0 ? listErrors : undefined;

    const ownerRow = rows.find((row) => row.role === 'account_owner' && row.customerId);
    if (ownerRow?.customerId) {
      return { role: 'account_owner', customerId: ownerRow.customerId, errors };
    }

    const reviewerRow = rows.find((row) => row.role === 'read_only' && row.customerId);
    if (reviewerRow?.customerId) {
      return { role: 'read_only', customerId: reviewerRow.customerId, errors };
    }

    // Legacy fallback: older records may still use sub as customerId.
    const legacyCustomer = await getCustomer(userSub);
    if (legacyCustomer.data) {
      return { role: 'account_owner', customerId: userSub, errors };
    }

    const fallbackError = new Error('No customer mapping found for the current user.');
    return {
      role: 'account_owner',
      customerId: '',
      errors: [...(errors ?? []), fallbackError],
    };
  } catch (error) {
    console.error('Error resolving customer portal context:', error);
    return {
      role: 'account_owner',
      customerId: userSub,
      errors: [error],
    };
  }
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
  try {
    const { data, errors } = await getDataClient().models.CustomerUser.create(input);
    if (errors) {
      console.error('Errors creating customer user:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error creating customer user:', error);
    return { data: null, errors: [error] };
  }
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
  try {
    const { data, errors } = await getDataClient().models.CustomerUser.update(input);
    if (errors) {
      console.error('Errors updating customer user:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error updating customer user:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * Delete a CustomerUser record by ID.
 * Only accessible by administrators.
 */
export async function deleteCustomerUser(customerUserId: string) {
  try {
    const { data, errors } = await getDataClient().models.CustomerUser.delete({ id: customerUserId });
    if (errors) {
      console.error('Errors deleting customer user:', errors);
    }
    return { data, errors };
  } catch (error) {
    console.error('Error deleting customer user:', error);
    return { data: null, errors: [error] };
  }
}

/**
 * List agency-closure blocks for a customer
 */
export async function listCustomerClosureBlocks(customerId: string) {
  try {
    const { data, errors } = await listAll(getDataClient(), 'CustomerClosureBlock', {
      filter: { customerId: { eq: customerId } },
    });

    if (errors.length > 0) {
      console.error('Errors fetching customer closure blocks:', errors);
      return { data: [], errors };
    }

    return { data: data || [], errors: undefined };
  } catch (error) {
    console.error('Error listing customer closure blocks:', error);
    return { data: [], errors: [error as Error] };
  }
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
  try {
    const { data, errors } = await getDataClient().models.CustomerClosureBlock.create(input);

    if (errors) {
      console.error('Errors creating customer closure block:', errors);
    }

    return { data, errors };
  } catch (error) {
    console.error('Error creating customer closure block:', error);
    return { data: null, errors: [error as Error] };
  }
}

/**
 * Delete an agency-closure block by ID
 */
export async function deleteCustomerClosureBlock(id: string) {
  try {
    const { data, errors } = await getDataClient().models.CustomerClosureBlock.delete({ id });

    if (errors) {
      console.error('Errors deleting customer closure block:', errors);
      return { data: null, errors };
    }

    return { data, errors: undefined };
  } catch (error) {
    console.error('Error deleting customer closure block:', error);
    return { data: null, errors: [error as Error] };
  }
}
