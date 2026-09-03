import { NextRequest, NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';

const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;

let _client: ReturnType<typeof generateClient<Schema>> | null = null;
function getDataClient() {
  if (!_client) {
    // Amplify is never configured elsewhere in this SSR process (unlike the
    // browser app, which calls configureAmplify() from AmplifyAuthProvider) --
    // without this, generateClient() runs against an empty resourcesConfig and
    // every call silently fails. authMode: 'iam' signs requests with the SSR
    // compute role's own credentials -- AppSync's generated resolvers grant
    // unconditional access to any non-Identity-Pool IAM caller, the same
    // elevated-access mechanism the customer-access-activation Lambda uses
    // via getAmplifyDataClientConfig().
    Amplify.configure(outputs);
    _client = generateClient<Schema>({ authMode: 'iam' });
  }
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
      ? CognitoJwtVerifier.create({
          userPoolId,
          tokenUse: 'id',
          clientId: userPoolClientId,
        })
      : null;
  }
  return _verifier;
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

const PENDING_SUB_PREFIX = 'pending:';

async function syncViewerSubsForCustomer(customerId: string, viewerSubs: string[]) {
  const client = getDataClient();

  const { data: routes } = await client.models.Route.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });
  for (const route of routes || []) {
    if (!route?.id) continue;
    await client.models.Route.update({ id: route.id, viewerSubs });

    const { data: stops } = await client.models.Stop.list({
      filter: { routeId: { eq: route.id } },
      limit: 1000,
    });
    for (const stop of stops || []) {
      if (!stop?.id) continue;
      await client.models.Stop.update({ id: stop.id, viewerSubs });
    }
  }

  const { data: invoices } = await client.models.Invoice.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });
  for (const invoice of invoices || []) {
    if (!invoice?.id) continue;
    await client.models.Invoice.update({ id: invoice.id, viewerSubs });
  }

  const { data: lineItems } = await client.models.LineItem.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });
  for (const lineItem of lineItems || []) {
    if (!lineItem?.id) continue;
    await client.models.LineItem.update({ id: lineItem.id, viewerSubs });
  }

  const { data: paymentRecords } = await client.models.PaymentRecord.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });
  for (const paymentRecord of paymentRecords || []) {
    if (!paymentRecord?.id) continue;
    await client.models.PaymentRecord.update({ id: paymentRecord.id, viewerSubs });
  }
}

/**
 * Backfills viewerSubs/accountOwnerSub across Customer, Route, Stop, Invoice, LineItem
 * and PaymentRecord for the calling customer's account.
 *
 * These fields are normally synced by the customer-access-activation Lambda at signup
 * time, but that trigger only fires on new sign-ups — accounts that were already active
 * before the fields existed never get them set. This route lets any already-active
 * customer self-heal on next portal visit: it runs with the SSR compute role's elevated
 * data access (same pattern as the admin API routes), so it can read/write these records
 * before viewerSubs/accountOwnerSub are populated, which the caller's own session cannot.
 */
export async function POST(request: NextRequest) {
  try {
    const token = getBearerToken(request);
    const verifier = getVerifier();
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

    await syncViewerSubsForCustomer(customerId, viewerSubs);

    return NextResponse.json({ success: true, customerId });
  } catch (err) {
    console.error('Unexpected error in sync-profile-access:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
