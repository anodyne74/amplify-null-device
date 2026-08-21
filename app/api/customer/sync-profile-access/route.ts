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

const verifier = userPoolId && userPoolClientId
  ? CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId: userPoolClientId,
    })
  : null;

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

const PENDING_SUB_PREFIX = 'pending:';

/**
 * Backfills Customer.viewerSubs/accountOwnerSub for the calling customer's account.
 *
 * These fields are normally synced by the customer-access-activation Lambda at signup
 * time, but that trigger only fires on new sign-ups — accounts that were already active
 * before the fields existed never get them set. This route lets any already-active
 * customer self-heal on next portal visit: it runs with the SSR compute role's elevated
 * data access (same pattern as the admin API routes), so it can read/write Customer
 * before accountOwnerSub/viewerSubs are populated, which the caller's own session cannot.
 */
export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    if (!token || !verifier) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let claims: VerifiedClaims;
    try {
      claims = (await verifier.verify(token)) as VerifiedClaims;
    } catch (err) {
      console.error('Token verification failed:', err);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const userGroups = claims['cognito:groups'] || [];
    if (!userGroups.includes('customer') || !claims.sub) {
      return NextResponse.json({ error: 'Forbidden: customer access required' }, { status: 403 });
    }

    const client = getDataClient();
    const { data: ownRows } = await client.models.CustomerUser.list({
      filter: { userSub: { eq: claims.sub } },
      limit: 100,
    });

    const customerId = (ownRows || []).find((row) => row?.customerId)?.customerId;
    if (!customerId) {
      return NextResponse.json({ error: 'No customer mapping found for this user' }, { status: 404 });
    }

    const { data: allRows } = await client.models.CustomerUser.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
    });

    const viewerSubs = [
      ...new Set(
        (allRows || [])
          .map((row) => row.userSub?.trim())
          .filter((value): value is string => Boolean(value) && !value.startsWith(PENDING_SUB_PREFIX))
      ),
    ];

    const accountOwnerRow = (allRows || []).find(
      (row) => row.role === 'account_owner' && row.userSub && !row.userSub.startsWith(PENDING_SUB_PREFIX)
    );

    await client.models.Customer.update({
      id: customerId,
      viewerSubs,
      accountOwnerSub: accountOwnerRow?.userSub || undefined,
    });

    return NextResponse.json({ success: true, customerId });
  } catch (err) {
    console.error('Unexpected error in sync-profile-access:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
