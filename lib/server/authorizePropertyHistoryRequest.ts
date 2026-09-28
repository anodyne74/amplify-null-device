import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import type { IamDataClient } from '@/lib/server/iamDataClient';
import type { VerifiedClaims } from '@/lib/server/verifyIamCaller';

/** Who is asking, as Property History scopes it. */
export type PropertyHistoryCaller = { audience: 'administrator' } | { audience: 'customer'; customerId: string; accountOwner: boolean };

export type AuthorizePropertyHistoryResult =
  | { ok: true; caller: PropertyHistoryCaller; claims: VerifiedClaims & { sub: string }; client: IamDataClient }
  | { ok: false; status: 401 | 403 | 500; error: string };

/**
 * The shared gate for every Property History API route (#288, #291): an
 * administrator, or a customer user whose Customer has the Property History
 * flag on (ADR 0005). Customer scope comes from authorizeIamRequest.
 *
 * `accountOwnersOnly` also refuses read-only customer users -- only Account
 * Owners see reports.
 */
export async function authorizePropertyHistoryRequest(
  request: Request,
  { accountOwnersOnly = false }: { accountOwnersOnly?: boolean } = {}
): Promise<AuthorizePropertyHistoryResult> {
  const auth = await authorizeIamRequest(request, ['customer', 'administrator'], { flag: 'property-history', accountOwnersOnly });
  if (!auth.ok) return auth;
  const { caller, claims, client } = auth;
  return {
    ok: true,
    caller: caller.audience === 'staff' ? { audience: 'administrator' } : { audience: 'customer', customerId: caller.customerId, accountOwner: caller.accountOwner },
    claims,
    client,
  };
}
