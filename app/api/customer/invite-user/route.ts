import { NextRequest, NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';
import { createOrGetCognitoUser } from '@/app/api/admin/users/route';
import { sendInvitationEmail } from '@/lib/emails/invitationEmail';

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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailDomain(email: string): string {
  return email.trim().toLowerCase().split('@')[1] || '';
}

/** Same Route/Stop/Invoice/LineItem/PaymentRecord viewerSubs sync loop already
 * duplicated in sync-profile-access/route.ts and the customer-access-activation
 * Lambda -- each runs in a different execution context (SSR API route vs.
 * Cognito trigger vs. browser-session client in lib/queries.ts, which only
 * covers Route/Stop), so this is kept as its own copy rather than a shared
 * import across those boundaries. Worth consolidating in a future cleanup PR. */
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
 * Lets a customer account_owner invite a teammate ("agent") into their own
 * portal. Creates a real Cognito login (via the shared createOrGetCognitoUser
 * helper -- same one the admin invite flow uses) and a read_only CustomerUser
 * record. Runs with the SSR compute role's elevated data access (same pattern
 * as sync-profile-access) since CustomerUser's own authorization only grants
 * account_owner/read_only a `read` scope -- they cannot create CustomerUser
 * rows or call Cognito Admin* APIs from their own session.
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

    const body = (await request.json().catch(() => null)) as { email?: string; name?: string } | null;
    const rawEmail = body?.email?.trim();
    if (!rawEmail || !EMAIL_PATTERN.test(rawEmail)) {
      return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
    }
    const normalizedEmail = rawEmail.toLowerCase();
    const name = body?.name?.trim() || undefined;

    const client = getDataClient();

    // The caller's own CustomerUser row -- never trust a client-supplied customerId,
    // this is the only source of truth for which customer they belong to, and their
    // own role must be account_owner to invite anyone.
    const { data: ownRows } = await client.models.CustomerUser.list({
      filter: { userSub: { eq: claims.sub } },
      limit: 100,
    });
    const ownRow = (ownRows || []).find((row) => row?.customerId);
    if (!ownRow?.customerId) {
      return NextResponse.json({ error: 'No customer mapping found for this user' }, { status: 404 });
    }
    if (ownRow.role !== 'account_owner') {
      return NextResponse.json({ error: 'Forbidden: only the account owner can invite teammates' }, { status: 403 });
    }
    const customerId = ownRow.customerId;

    const { data: customer } = await client.models.Customer.get({ id: customerId });
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    if (customer.restrictInvitesToOwnDomain) {
      const requiredDomain = emailDomain(customer.email || '');
      if (requiredDomain && emailDomain(normalizedEmail) !== requiredDomain) {
        return NextResponse.json(
          { error: `Invited emails must use the @${requiredDomain} domain.` },
          { status: 400 }
        );
      }
    }

    const { data: existingRows } = await client.models.CustomerUser.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
    });
    const alreadyInvited = (existingRows || []).some(
      (row) => (row.email || '').trim().toLowerCase() === normalizedEmail
    );
    if (alreadyInvited) {
      return NextResponse.json({ error: 'This email has already been invited to your team.' }, { status: 409 });
    }

    const { sub, username, created: cognitoUserCreated, temporaryPassword } = await createOrGetCognitoUser({
      poolId: userPoolId!,
      email: normalizedEmail,
      name,
      groupName: 'customer',
      sendInvitationEmail: true,
    });
    if (!sub) {
      return NextResponse.json({ error: 'Could not create a login for this email.' }, { status: 500 });
    }

    const { data: created, errors } = await client.models.CustomerUser.create({
      customerId,
      userSub: sub,
      accountOwnerSub: claims.sub,
      role: 'read_only',
      name,
      email: normalizedEmail,
    });
    if (errors && errors.length > 0) {
      console.error('Errors creating CustomerUser:', errors);
      return NextResponse.json({ error: 'Failed to add teammate to your account.' }, { status: 500 });
    }

    const viewerSubs = [
      ...new Set(
        [...(existingRows || []).map((row) => row.userSub?.trim()), sub].filter(
          (value): value is string => Boolean(value)
        )
      ),
    ];
    await client.models.Customer.update({ id: customerId, viewerSubs });
    await syncViewerSubsForCustomer(customerId, viewerSubs);

    let emailSent = false;
    if (cognitoUserCreated && temporaryPassword) {
      try {
        await sendInvitationEmail({
          toEmail: normalizedEmail,
          inviteeName: name,
          customerName: customer.companyName || customer.name || 'your team',
          inviterName: ownRow.name || 'A teammate',
          inviterEmail: ownRow.email || '',
          temporaryPassword,
        });
        emailSent = true;
      } catch (err) {
        // Non-blocking: the teammate's login and access are already set up.
        console.error('Failed to send branded invitation email:', err);
      }
    }

    return NextResponse.json({ success: true, user: { sub, username }, customerUser: created, emailSent });
  } catch (err) {
    console.error('Unexpected error in customer invite-user:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
