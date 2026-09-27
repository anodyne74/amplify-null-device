import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import type { IamDataClient } from '@/lib/server/iamDataClient';
import { isFeatureOnForCustomer } from '@/lib/server/featureFlags';
import type { VerifiedClaims } from '@/lib/server/verifyIamCaller';
import { listAll } from '@/lib/listAll';

/** Who is asking, as Property History scopes it. */
export type PropertyHistoryCaller = { audience: 'administrator' } | { audience: 'customer'; customerId: string; accountOwner: boolean };

export type AuthorizePropertyHistoryResult =
  | { ok: true; caller: PropertyHistoryCaller; claims: VerifiedClaims & { sub: string }; client: IamDataClient }
  | { ok: false; status: 401 | 403 | 500; error: string };

/**
 * The shared gate for every Property History API route (#288, #291): an
 * administrator, or a customer user whose Customer has the Property History
 * flag on (ADR 0005). A customer's Customer comes from their own CustomerUser
 * row, never the request. Staff access doesn't check the flag.
 *
 * `accountOwnersOnly` also refuses read-only customer users -- only Account
 * Owners see reports.
 */
export async function authorizePropertyHistoryRequest(
  request: Request,
  { accountOwnersOnly = false }: { accountOwnersOnly?: boolean } = {}
): Promise<AuthorizePropertyHistoryResult> {
  const auth = await authorizeIamRequest(request, ['customer', 'administrator']);
  if (!auth.ok) return auth;
  const { claims, client } = auth;

  if ((claims['cognito:groups'] ?? []).includes('administrator')) {
    return { ok: true, caller: { audience: 'administrator' }, claims, client };
  }

  const { data: ownRows, errors } = await listAll(client, 'CustomerUser', {
    filter: { userSub: { eq: claims.sub } },
  });
  if (errors.length > 0) {
    console.error("Reading the caller's CustomerUser row failed:", errors);
    return { ok: false, status: 500, error: 'Property History is unavailable' };
  }
  const ownRow = ownRows.find((row) => row?.customerId);
  if (!ownRow || !(await isFeatureOnForCustomer(client, ownRow.customerId, 'property-history'))) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  const accountOwner = ownRow.role === 'account_owner';
  if (accountOwnersOnly && !accountOwner) {
    return { ok: false, status: 403, error: 'Forbidden: Account Owner access required' };
  }

  return { ok: true, caller: { audience: 'customer', customerId: ownRow.customerId, accountOwner }, claims, client };
}
