import { CognitoJwtVerifier } from 'aws-jwt-verify';
import outputs from '@/amplify_outputs.json';

const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;

/** Only the claims fields any caller currently reads off a verified ID token.
 * `sub`/`cognito:groups` are always present on a real token; the rest are read
 * by callers that display or log the caller's identity (e.g. audit logging,
 * "invited by" email fields). */
export interface VerifiedClaims {
  sub?: string;
  email?: string;
  name?: string;
  'cognito:username'?: string;
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

export type VerifyIamCallerResult =
  | { ok: true; claims: VerifiedClaims & { sub: string }; token: string }
  | { ok: false; status: 401; error: string }
  // A 403 still carries a successfully-verified token/claims (the caller is
  // authenticated, just in the wrong group) -- callers that audit-log a
  // denied attempt (e.g. app/api/admin/users/route.ts) need those, not just
  // the error string.
  | { ok: false; status: 403; error: string; claims: VerifiedClaims; token: string };

/**
 * Verifies the caller's Cognito ID token and required group membership. The
 * sole per-route authorization backstop for IAM-mode SSR routes -- see
 * docs/adr/0001-ssr-iam-access-bypasses-appsync-authorization.md: AppSync
 * grants this Lambda's execution role unconditional access to these models,
 * so this function (not AppSync) is what actually enforces the group check.
 *
 * Returns the raw token alongside claims for callers that need it downstream
 * (e.g. as the Authorization header on a direct GraphQL fetch, or in an audit
 * log entry). Callers that also need an IAM-signed Data client should use
 * authorizeIamRequest(), which wraps this and attaches one.
 */
export async function verifyIamCaller(
  request: Request,
  requiredGroup: RequiredGroup
): Promise<VerifyIamCallerResult> {
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
    return { ok: false, status: 403, error: FORBIDDEN_MESSAGE[requiredGroup], claims, token };
  }

  return { ok: true, claims: claims as VerifiedClaims & { sub: string }, token };
}
