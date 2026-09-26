/**
 * Customer access sync — the one place that decides who can read a
 * Customer's records.
 *
 * Customer users are granted read access through `viewerSubs` (and, on
 * Customer, `accountOwnerSub`) stamped on each record, because `customerId`
 * is a foreign key, not a Cognito sub, so ownerDefinedIn can't use it. Every
 * time CustomerUser membership changes, those stamps must be rewritten on
 * every record the customer owns, or users keep (or never gain) access.
 *
 * The viewer list is derived here from the customer's CustomerUser rows —
 * callers don't compute it. `list` is eventually consistent, so a caller that
 * has just created or deleted a row passes that user's sub as a hint and the
 * sync applies it on top of what it reads.
 *
 * Error policy: if the CustomerUser read has any errors, nothing is written —
 * stamping a partial viewer list would silently revoke real users. Otherwise
 * each record update is independent; failures are collected and the sync
 * carries on.
 *
 * Needs a data client that can update every model below, including
 * CustomerClosureBlock (customer-written only), so in practice an IAM client:
 * the SSR API routes or the customer-access-activation Lambda. No `@/`
 * imports, so the Lambda can bundle it.
 */
import { listAll } from './listAll';

const PENDING_SUB_PREFIX = 'pending:';

/** Records stamped with the customer's viewerSubs, found by customerId. */
const CUSTOMER_SCOPED_MODELS = [
  'Route',
  'Invoice',
  'LineItem',
  'PaymentRecord',
  'OperatorAvailabilityBlock',
  'CustomerClosureBlock',
  'CustomerUser',
] as const;

type AccessModel = 'Customer' | 'Stop' | (typeof CUSTOMER_SCOPED_MODELS)[number];

type UpdateResult = { errors?: readonly unknown[] | null };
type UpdatableModels = Record<string, { update: (input: object) => Promise<UpdateResult> }>;

export type CustomerAccessChange = {
  /** Sub of a user just added — included even if their row isn't listed yet. */
  added?: string;
  /** Sub of a user just removed — excluded even if their row is still listed. */
  removed?: string;
};

export type CustomerAccessSyncResult = {
  updated: Partial<Record<AccessModel, number>>;
  errors: unknown[];
};

function isRealSub(sub: string | null | undefined): sub is string {
  return Boolean(sub) && !sub!.startsWith(PENDING_SUB_PREFIX);
}

export async function syncCustomerAccess(
  client: { models: object },
  customerId: string,
  change: CustomerAccessChange = {}
): Promise<CustomerAccessSyncResult> {
  const models = client.models as UpdatableModels;
  const updated: CustomerAccessSyncResult['updated'] = {};
  const errors: unknown[] = [];

  const update = async (model: AccessModel, input: { id: string } & Record<string, unknown>) => {
    try {
      const result = await models[model].update(input);
      if (result.errors && result.errors.length > 0) {
        errors.push(...result.errors);
        return;
      }
      updated[model] = (updated[model] ?? 0) + 1;
    } catch (error) {
      errors.push(error);
    }
  };

  const { data: userRows, errors: userListErrors } = await listAll(client, 'CustomerUser', {
    filter: { customerId: { eq: customerId } },
  });
  if (userListErrors.length > 0) {
    return { updated, errors: userListErrors };
  }

  const members = userRows.filter((row) => !change.removed || row.userSub?.trim() !== change.removed);
  const viewerSubs = [
    ...new Set(
      [...members.map((row) => row.userSub?.trim()), change.added].filter(isRealSub)
    ),
  ];
  const accountOwnerSub = members.find((row) => row.role === 'account_owner' && isRealSub(row.userSub))?.userSub;

  await update('Customer', { id: customerId, viewerSubs, ...(accountOwnerSub ? { accountOwnerSub } : {}) });

  for (const model of CUSTOMER_SCOPED_MODELS) {
    // CustomerUser rows were already read above — re-listing could disagree.
    const rows =
      model === 'CustomerUser'
        ? members
        : await listAll(client, model, { filter: { customerId: { eq: customerId } } }).then((result) => {
            errors.push(...result.errors);
            return result.data;
          });

    for (const row of rows) {
      await update(model, { id: row.id, viewerSubs });

      // Stop.customerId is optional on older records, so stops are found
      // through their route rather than by customerId.
      if (model === 'Route') {
        const { data: stops, errors: stopListErrors } = await listAll(client, 'Stop', {
          filter: { routeId: { eq: row.id } },
        });
        errors.push(...stopListErrors);
        for (const stop of stops) {
          await update('Stop', { id: stop.id, viewerSubs });
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`syncCustomerAccess(${customerId}) completed with ${errors.length} error(s):`, errors);
  }

  return { updated, errors };
}
