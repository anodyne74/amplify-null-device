import { NextRequest, NextResponse } from 'next/server';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { generateClient } from 'aws-amplify/data';
import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';

const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const cognitoClient = new CognitoIdentityProviderClient({});

const branchName = (process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || '')
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-+|-+$/g, '');

function templateNameFor(envVar: string, base: string) {
  const fallback = branchName ? `${base}-${branchName}` : base;
  return process.env[envVar] || fallback;
}

const welcomeTemplateName = templateNameFor('SES_WELCOME_TEMPLATE_NAME', 'NullDeviceWelcomeTemplate');
const rejectedTemplateName = templateNameFor('SES_ACCOUNT_REQUEST_REJECTED_TEMPLATE_NAME', 'NullDeviceAccountRequestRejectedTemplate');

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

function getAttributeValue(attributes: { Name?: string; Value?: string }[] | undefined, name: string) {
  return attributes?.find((attr) => attr.Name === name)?.Value;
}

async function resolveCognitoUsernameByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const response = await cognitoClient.send(
    new ListUsersCommand({
      UserPoolId: userPoolId,
      Filter: `email = "${escaped}"`,
      Limit: 10,
    } as any)
  );
  const matched = (response.Users || []).find(
    (user) => getAttributeValue(user.Attributes, 'email')?.toLowerCase() === normalized
  );
  return matched?.Username || null;
}

async function ensureCustomerGroup(username: string) {
  const groupsResponse = await cognitoClient.send(
    new AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username: username })
  );
  const groups = (groupsResponse.Groups || []).map((group) => group.GroupName).filter(Boolean);
  if (!groups.includes('customer')) {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: username, GroupName: 'customer' })
    );
  }
}

async function syncViewerSubsForCustomer(customerId: string, viewerSubs: string[]) {
  const client = getDataClient();

  const { data: routes } = await client.models.Route.list({ filter: { customerId: { eq: customerId } }, limit: 1000 });
  for (const route of routes || []) {
    if (!route?.id) continue;
    await client.models.Route.update({ id: route.id, viewerSubs });
    const { data: stops } = await client.models.Stop.list({ filter: { routeId: { eq: route.id } }, limit: 1000 });
    for (const stop of stops || []) {
      if (!stop?.id) continue;
      await client.models.Stop.update({ id: stop.id, viewerSubs });
    }
  }

  const { data: invoices } = await client.models.Invoice.list({ filter: { customerId: { eq: customerId } }, limit: 1000 });
  for (const invoice of invoices || []) {
    if (!invoice?.id) continue;
    await client.models.Invoice.update({ id: invoice.id, viewerSubs });
  }

  const { data: lineItems } = await client.models.LineItem.list({ filter: { customerId: { eq: customerId } }, limit: 1000 });
  for (const lineItem of lineItems || []) {
    if (!lineItem?.id) continue;
    await client.models.LineItem.update({ id: lineItem.id, viewerSubs });
  }

  const { data: paymentRecords } = await client.models.PaymentRecord.list({ filter: { customerId: { eq: customerId } }, limit: 1000 });
  for (const paymentRecord of paymentRecords || []) {
    if (!paymentRecord?.id) continue;
    await client.models.PaymentRecord.update({ id: paymentRecord.id, viewerSubs });
  }
}

async function sendApprovedEmail(email: string, customerName: string) {
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://nulldevice.dev').replace(/\/$/, '');
  const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';
  try {
    await sesClient.send(
      new SendTemplatedEmailCommand({
        Source: senderEmail,
        Destination: { ToAddresses: [email] },
        Template: welcomeTemplateName,
        TemplateData: JSON.stringify({
          customerName,
          logoUrl: `${appBaseUrl}/logo.svg`,
          portalUrl: `${appBaseUrl}/customer`,
          year: String(new Date().getFullYear()),
        }),
      })
    );
  } catch (error) {
    console.error('Error sending account approval email:', error);
  }
}

async function sendRejectedEmail(email: string, customerName: string, note: string) {
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://nulldevice.dev').replace(/\/$/, '');
  const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';
  try {
    await sesClient.send(
      new SendTemplatedEmailCommand({
        Source: senderEmail,
        Destination: { ToAddresses: [email] },
        Template: rejectedTemplateName,
        TemplateData: JSON.stringify({
          customerName,
          decisionNote: note,
          logoUrl: `${appBaseUrl}/logo.svg`,
          year: String(new Date().getFullYear()),
        }),
      })
    );
  } catch (error) {
    console.error('Error sending account rejection email:', error);
  }
}

/**
 * Approves or rejects a pending AccountRequest. Callable by an administrator or by the
 * account owner of the request's own customer — that check depends on a different
 * record (Customer/CustomerUser), so it runs here with elevated data access rather than
 * as a schema-level rule on AccountRequest itself.
 */
export async function POST(request: NextRequest) {
  const claims = await verifyCaller(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { requestId?: string; decision?: 'approve' | 'reject'; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.requestId || (body.decision !== 'approve' && body.decision !== 'reject')) {
    return NextResponse.json({ error: 'requestId and a valid decision are required.' }, { status: 400 });
  }

  const client = getDataClient();

  const { data: accountRequest } = await client.models.AccountRequest.get({ id: body.requestId });
  if (!accountRequest) {
    return NextResponse.json({ error: 'Request not found.' }, { status: 404 });
  }
  if (accountRequest.status !== 'pending') {
    return NextResponse.json({ error: 'This request has already been decided.' }, { status: 400 });
  }

  const isAdmin = (claims['cognito:groups'] || []).includes('administrator');
  if (!isAdmin) {
    const { data: ownerRows } = await client.models.CustomerUser.list({
      filter: {
        userSub: { eq: claims.sub },
        customerId: { eq: accountRequest.customerId },
        role: { eq: 'account_owner' },
      },
      limit: 1,
    });
    if (!ownerRows || ownerRows.length === 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: customer } = await client.models.Customer.get({ id: accountRequest.customerId });
  if (!customer) {
    return NextResponse.json({ error: 'That company could not be found.' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const note = body.note?.trim() || '';

  if (body.decision === 'reject') {
    const { data: updated } = await client.models.AccountRequest.update({
      id: accountRequest.id,
      status: 'rejected',
      decidedAt: now,
      decidedByUserSub: claims.sub!,
      decisionNote: note || undefined,
    });
    await sendRejectedEmail(accountRequest.email, customer.name, note || 'No reason was given.');
    return NextResponse.json({ request: updated });
  }

  const { data: existingRows } = await client.models.CustomerUser.list({
    filter: { customerId: { eq: accountRequest.customerId } },
    limit: 1000,
  });
  const existingOwner = (existingRows || []).find((row) => row.role === 'account_owner');
  const alreadyMember = (existingRows || []).find((row) => row.userSub === accountRequest.requesterSub);

  if (!alreadyMember) {
    if (accountRequest.role === 'read_only' && !existingOwner) {
      return NextResponse.json(
        { error: 'This company has no account owner yet — approve an account owner request first.' },
        { status: 400 }
      );
    }
    if (accountRequest.role === 'account_owner' && existingOwner && existingOwner.userSub !== accountRequest.requesterSub) {
      return NextResponse.json({ error: 'This company already has an account owner.' }, { status: 400 });
    }

    const username = await resolveCognitoUsernameByEmail(accountRequest.email);
    if (!username) {
      return NextResponse.json({ error: "Could not locate this user's account." }, { status: 500 });
    }
    await ensureCustomerGroup(username);

    const accountOwnerSub =
      accountRequest.role === 'account_owner' ? accountRequest.requesterSub : (existingOwner?.userSub || accountRequest.requesterSub);

    await client.models.CustomerUser.create({
      customerId: accountRequest.customerId,
      userSub: accountRequest.requesterSub,
      accountOwnerSub,
      role: accountRequest.role || 'read_only',
      name: accountRequest.name || undefined,
      email: accountRequest.email,
    });

    if (accountRequest.role === 'account_owner') {
      await client.models.Customer.update({ id: accountRequest.customerId, accountOwnerSub: accountRequest.requesterSub });
    }

    const { data: allRows } = await client.models.CustomerUser.list({
      filter: { customerId: { eq: accountRequest.customerId } },
      limit: 1000,
    });
    const viewerSubs = [...new Set((allRows || []).map((row) => row.userSub?.trim()).filter((v): v is string => Boolean(v)))];
    await client.models.Customer.update({ id: accountRequest.customerId, viewerSubs });
    await syncViewerSubsForCustomer(accountRequest.customerId, viewerSubs);
  }

  const { data: updated } = await client.models.AccountRequest.update({
    id: accountRequest.id,
    status: 'approved',
    decidedAt: now,
    decidedByUserSub: claims.sub!,
    decisionNote: note || undefined,
  });

  await sendApprovedEmail(accountRequest.email, customer.companyName || customer.name);

  return NextResponse.json({ request: updated });
}
