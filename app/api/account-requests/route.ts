import { NextRequest, NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { generateClient } from 'aws-amplify/data';
import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';

const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

const branchName = (process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || '')
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+$/g, '');
const defaultAccountRequestNotifyTemplateName = branchName
  ? `NullDeviceAccountRequestNotifyTemplate-${branchName}`
  : 'NullDeviceAccountRequestNotifyTemplate';
const accountRequestNotifyTemplateName =
  process.env.SES_ACCOUNT_REQUEST_NOTIFY_TEMPLATE_NAME || defaultAccountRequestNotifyTemplateName;

let _client: ReturnType<typeof generateClient<Schema>> | null = null;
function getDataClient() {
  if (!_client) _client = generateClient<Schema>();
  return _client;
}

type VerifiedClaims = {
  sub?: string;
  email?: string;
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

async function verifyCaller(request: NextRequest): Promise<VerifiedClaims | null> {
  const token = getBearerToken(request);
  if (!token || !verifier) return null;
  try {
    const claims = (await verifier.verify(token)) as VerifiedClaims;
    if (!claims.sub || !claims.email) return null;
    return claims;
  } catch (err) {
    console.error('Token verification failed:', err);
    return null;
  }
}

async function notifyAccountOwner(customerId: string, customerName: string, requesterName: string, requesterEmail: string, role: string) {
  const client = getDataClient();
  const { data: rows } = await client.models.CustomerUser.list({
    filter: { customerId: { eq: customerId }, role: { eq: 'account_owner' } },
    limit: 10,
  });

  const owner = (rows || []).find((row) => row?.email);
  if (!owner?.email) {
    // No account owner assigned yet for this customer — nothing to notify. The request
    // still gets created and stays visible to administrators.
    return;
  }

  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://nulldevice.dev').replace(/\/$/, '');
  const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';

  try {
    await sesClient.send(
      new SendTemplatedEmailCommand({
        Source: senderEmail,
        Destination: { ToAddresses: [owner.email] },
        Template: accountRequestNotifyTemplateName,
        TemplateData: JSON.stringify({
          customerName,
          requesterName: requesterName || requesterEmail,
          requesterEmail,
          requestedRole: role === 'account_owner' ? 'an account owner' : 'a read-only user',
          reviewUrl: `${appBaseUrl}/customer/account-requests`,
          logoUrl: `${appBaseUrl}/logo.svg`,
          year: String(new Date().getFullYear()),
        }),
      })
    );
  } catch (error) {
    // Non-blocking: the request must still succeed even if the notification email fails.
    console.error('Error sending account request notification email:', error);
  }
}

/** Returns the caller's own most recent account request (if any) plus the customer picker list. */
export async function GET(request: NextRequest) {
  const claims = await verifyCaller(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getDataClient();

  const [{ data: myRequests }, { data: customers }] = await Promise.all([
    client.models.AccountRequest.list({
      filter: { requesterSub: { eq: claims.sub } },
      limit: 10,
    }),
    client.models.Customer.list({ limit: 200 }),
  ]);

  const sorted = [...(myRequests || [])].sort(
    (a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || '')
  );
  const latest = sorted[0] || null;

  let enrichedRequest: Record<string, unknown> | null = null;
  if (latest) {
    const [{ data: customer }, { data: ownerRows }] = await Promise.all([
      client.models.Customer.get({ id: latest.customerId }),
      client.models.CustomerUser.list({
        filter: { customerId: { eq: latest.customerId }, role: { eq: 'account_owner' } },
        limit: 10,
      }),
    ]);
    const owner = (ownerRows || []).find((row) => row?.email);

    enrichedRequest = {
      ...latest,
      customerName: customer?.companyName || customer?.name || null,
      accountOwnerName: owner?.name || owner?.email || null,
    };
  }

  return NextResponse.json({
    request: enrichedRequest,
    customers: (customers || []).map((c) => ({ id: c.id, name: c.name })),
  });
}

export async function POST(request: NextRequest) {
  const claims = await verifyCaller(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { customerId?: string; role?: 'account_owner' | 'read_only'; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.customerId || !body.role) {
    return NextResponse.json({ error: 'customerId and role are required.' }, { status: 400 });
  }

  const client = getDataClient();

  const { data: existing } = await client.models.AccountRequest.list({
    filter: { requesterSub: { eq: claims.sub }, status: { eq: 'pending' } },
    limit: 1,
  });
  if (existing && existing.length > 0) {
    return NextResponse.json({ request: existing[0] });
  }

  const customerResult = await client.models.Customer.get({ id: body.customerId });
  if (!customerResult.data) {
    return NextResponse.json({ error: 'That company could not be found.' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: created, errors } = await client.models.AccountRequest.create({
    requesterSub: claims.sub!,
    email: claims.email!,
    name: body.name?.trim() || undefined,
    customerId: body.customerId,
    role: body.role,
    status: 'pending',
    requestedAt: now,
  });

  if (errors && errors.length > 0) {
    console.error('Errors creating account request:', errors);
    return NextResponse.json({ error: 'Could not submit request.' }, { status: 500 });
  }

  await notifyAccountOwner(
    body.customerId,
    customerResult.data.name,
    body.name?.trim() || '',
    claims.email!,
    body.role
  );

  return NextResponse.json({ request: created });
}
