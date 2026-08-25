import { NextRequest, NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';

const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;

let _client: ReturnType<typeof generateClient<Schema>> | null = null;
function getDataClient() {
  if (!_client) _client = generateClient<Schema>();
  return _client;
}

type VerifiedClaims = {
  sub?: string;
  'cognito:groups'?: string[];
};

let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null | undefined;
function getVerifier() {
  if (_verifier === undefined) {
    _verifier = userPoolId && userPoolClientId
      ? CognitoJwtVerifier.create({ userPoolId, tokenUse: 'id', clientId: userPoolClientId })
      : null;
  }
  return _verifier;
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length).trim();
}

async function verifyCaller(request: NextRequest): Promise<VerifiedClaims | null> {
  const token = getBearerToken(request);
  const verifier = getVerifier();
  if (!token || !verifier) return null;
  try {
    const claims = (await verifier.verify(token)) as VerifiedClaims;
    if (!claims.sub) return null;
    return claims;
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}

/**
 * Lists account requests the caller may act on: an administrator sees every request,
 * an account owner sees only requests for the company (or companies) they own. Used to
 * build the /customer/account-requests review queue.
 */
export async function GET(request: NextRequest) {
  const claims = await verifyCaller(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getDataClient();
  const isAdmin = (claims['cognito:groups'] || []).includes('administrator');

  let ownedCustomerIds: string[] = [];
  if (!isAdmin) {
    const { data: ownRows } = await client.models.CustomerUser.list({
      filter: { userSub: { eq: claims.sub }, role: { eq: 'account_owner' } },
      limit: 100,
    });
    ownedCustomerIds = [...new Set((ownRows || []).map((row) => row.customerId).filter((id): id is string => Boolean(id)))];
    if (ownedCustomerIds.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: allRequests } = await client.models.AccountRequest.list({ limit: 500 });
  const visible = isAdmin
    ? (allRequests || [])
    : (allRequests || []).filter((r) => r.customerId && ownedCustomerIds.includes(r.customerId));

  const customerIds = [...new Set(visible.map((r) => r.customerId).filter((id): id is string => Boolean(id)))];
  const customerNames = new Map<string, string>();
  await Promise.all(
    customerIds.map(async (id) => {
      const { data } = await client.models.Customer.get({ id });
      if (data) customerNames.set(id, data.name);
    })
  );

  const sorted = [...visible].sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));

  return NextResponse.json({
    requests: sorted.map((r) => ({
      id: r.id,
      requesterSub: r.requesterSub,
      email: r.email,
      name: r.name,
      customerId: r.customerId,
      customerName: r.customerId ? customerNames.get(r.customerId) || null : null,
      role: r.role,
      status: r.status,
      requestedAt: r.requestedAt,
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
    })),
  });
}
