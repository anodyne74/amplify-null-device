import { getIamDataClient, type IamDataClient } from './iamDataClient';
import { verifyIamCaller, type RequiredGroup, type VerifiedClaims } from './verifyIamCaller';
import { isFeatureOnForCustomer } from './featureFlags';
import type { FeatureFlagName } from '@/lib/featureFlags';
import { listAll } from '@/lib/listAll';

export type { RequiredGroup };

/** The caller's own CustomerUser row, as the gate read it. */
export type CallerCustomerUser = {
  customerId: string;
  role?: string | null;
  name?: string | null;
  email?: string | null;
};

export type StaffCaller = { audience: 'staff' };
export type CustomerCaller = { audience: 'customer'; customerId: string; accountOwner: boolean; row: CallerCustomerUser };

/**
 * Who is asking. Operators and administrators are `staff`; a customer user
 * carries the Customer from their own CustomerUser row, never the request.
 */
export type IamCaller = StaffCaller | CustomerCaller;

export type AuthorizeIamRequestOptions = {
  /** Refuse a customer caller unless this Feature Flag is on for their Customer (ADR 0005). */
  flag?: FeatureFlagName;
  /** Refuse a customer caller who isn't their Customer's Account Owner. */
  accountOwnersOnly?: boolean;
};

export type AuthorizeIamRequestResult<Caller extends IamCaller = IamCaller> =
  | { ok: true; caller: Caller; claims: VerifiedClaims & { sub: string }; client: IamDataClient }
  | { ok: false; status: 401 | 403 | 500; error: string };

const STAFF_GROUPS: readonly RequiredGroup[] = ['operator', 'administrator'];

/**
 * Verifies the caller's Cognito ID token and required group membership, then
 * hands back the IAM-signed data client -- the only route in to
 * getIamDataClient()'s elevated access, so a new API route literally cannot
 * reach it without this check running first (recordServerAudit() also uses
 * it, but can only append an audit entry). See
 * docs/adr/0001-ssr-iam-access-bypasses-appsync-authorization.md: AppSync
 * grants this Lambda's execution role unconditional access to these models,
 * so this function (not AppSync) is the only authorization backstop.
 *
 * A caller let in through a staff group the route allows is `staff`. Anyone
 * else is a customer, scoped to the Customer on their own CustomerUser row: no
 * row is a 403, and so are the `flag` and `accountOwnersOnly` checks when
 * asked for. Staff skip all three. A failed CustomerUser read is a 500, never
 * "not found".
 */
export async function authorizeIamRequest(
  request: Request,
  requiredGroup: 'customer',
  options?: AuthorizeIamRequestOptions
): Promise<AuthorizeIamRequestResult<CustomerCaller>>;
export async function authorizeIamRequest(
  request: Request,
  requiredGroup: RequiredGroup | readonly RequiredGroup[],
  options?: AuthorizeIamRequestOptions
): Promise<AuthorizeIamRequestResult>;
export async function authorizeIamRequest(
  request: Request,
  requiredGroup: RequiredGroup | readonly RequiredGroup[],
  { flag, accountOwnersOnly = false }: AuthorizeIamRequestOptions = {}
): Promise<AuthorizeIamRequestResult> {
  const result = await verifyIamCaller(request, requiredGroup);
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }
  const { claims } = result;
  const client = getIamDataClient();

  const allowed: readonly RequiredGroup[] = typeof requiredGroup === 'string' ? [requiredGroup] : requiredGroup;
  const groups = claims['cognito:groups'] ?? [];
  if (STAFF_GROUPS.some((group) => allowed.includes(group) && groups.includes(group))) {
    return { ok: true, caller: { audience: 'staff' }, claims, client };
  }

  const { data: ownRows, errors } = await listAll(client, 'CustomerUser', {
    filter: { userSub: { eq: claims.sub } },
  });
  if (errors.length > 0) {
    console.error("Reading the caller's CustomerUser row failed:", errors);
    return { ok: false, status: 500, error: 'Could not check your access' };
  }
  const row = ownRows.find((candidate) => candidate?.customerId) as CallerCustomerUser | undefined;
  if (!row) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  if (flag && !(await isFeatureOnForCustomer(client, row.customerId, flag))) {
    return { ok: false, status: 403, error: "This isn't available for your account." };
  }
  const accountOwner = row.role === 'account_owner';
  if (accountOwnersOnly && !accountOwner) {
    return { ok: false, status: 403, error: 'Forbidden: Account Owner access required' };
  }

  return { ok: true, caller: { audience: 'customer', customerId: row.customerId, accountOwner, row }, claims, client };
}
