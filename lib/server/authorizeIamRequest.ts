import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { getIamDataClient, type IamDataClient } from './iamDataClient';
import outputs from '@/amplify_outputs.json';

const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;

interface VerifiedClaims {
  sub?: string;
  'cognito:groups'?: string[];
}

let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null | undefined;
function getVerifier() {
  if (_verifier === undefined) {
    _verifier = userPoolId && userPoolClientId
      ? CognitoJwtVerifier.create({
          userPoolId,
          tokenUse: 'id',
          clientId: userPoolClientId,
        })
      : null;
  }
  return _verifier;
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

export type RequiredGroup = 'customer' | 'administrator';

const FORBIDDEN_MESSAGE: Record<RequiredGroup, string> = {
  customer: 'Forbidden: customer access required',
  administrator: 'Forbidden: admin access required',
};

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
  const token = getBearerToken(request);
  const verifier = getVerifier();
  if (!token || !verifier) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  let claims: VerifiedClaims;
  try {
    claims = (await verifier.verify(token)) as VerifiedClaims;
  } catch (err) {
    console.error('Token verification failed:', err);
    return { ok: false, status: 401, error: 'Invalid token' };
  }

  const userGroups = claims['cognito:groups'] || [];
  const missingRequiredSub = requiredGroup === 'customer' && !claims.sub;
  if (!userGroups.includes(requiredGroup) || missingRequiredSub) {
    return { ok: false, status: 403, error: FORBIDDEN_MESSAGE[requiredGroup] };
  }

  return { ok: true, claims: claims as VerifiedClaims & { sub: string }, client: getIamDataClient() };
}
