import { getIamDataClient, type IamDataClient } from './iamDataClient';
import { verifyIamCaller, type RequiredGroup, type VerifiedClaims } from './verifyIamCaller';

export type { RequiredGroup };

export type AuthorizeIamRequestResult =
  | { ok: true; claims: VerifiedClaims & { sub: string }; client: IamDataClient }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Verifies the caller's Cognito ID token and required group membership, then
 * hands back the IAM-signed data client -- the only route in to
 * getIamDataClient()'s elevated access, so a new API route literally cannot
 * reach it without this check running first. See
 * docs/adr/0001-ssr-iam-access-bypasses-appsync-authorization.md: AppSync
 * grants this Lambda's execution role unconditional access to these models,
 * so this function (not AppSync) is the only authorization backstop.
 */
export async function authorizeIamRequest(
  request: Request,
  requiredGroup: RequiredGroup
): Promise<AuthorizeIamRequestResult> {
  const result = await verifyIamCaller(request, requiredGroup);
  if (!result.ok) {
    return { ok: false, status: result.status, error: result.error };
  }

  return { ok: true, claims: result.claims, client: getIamDataClient() };
}
