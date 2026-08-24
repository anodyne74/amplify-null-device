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

const RESEND_COOLDOWN_MS = 30 * 60 * 1000;

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
  ? CognitoJwtVerifier.create({ userPoolId, tokenUse: 'id', clientId: userPoolClientId })
  : null;

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
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

/**
 * Re-sends the "new account request" notification to the company's account owner, for
 * the caller's own pending request — the "Chase it up" action on /pending-approval.
 * Rate-limited against lastNotifiedAt (falling back to requestedAt) so a requester can't
 * spam the account owner's inbox.
 */
export async function POST(request: NextRequest) {
  const claims = await verifyCaller(request);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = getDataClient();

  const { data: myRequests } = await client.models.AccountRequest.list({
    filter: { requesterSub: { eq: claims.sub }, status: { eq: 'pending' } },
    limit: 1,
  });
  const accountRequest = (myRequests || [])[0];
  if (!accountRequest) {
    return NextResponse.json({ error: 'No pending request found.' }, { status: 404 });
  }

  const lastSentAt = accountRequest.lastNotifiedAt || accountRequest.requestedAt;
  if (lastSentAt) {
    const elapsedMs = Date.now() - new Date(lastSentAt).getTime();
    if (elapsedMs < RESEND_COOLDOWN_MS) {
      const waitMinutes = Math.ceil((RESEND_COOLDOWN_MS - elapsedMs) / 60000);
      return NextResponse.json(
        { error: `Please wait ${waitMinutes} more minute${waitMinutes === 1 ? '' : 's'} before chasing this up again.` },
        { status: 429 }
      );
    }
  }

  const { data: customer } = await client.models.Customer.get({ id: accountRequest.customerId });
  if (!customer) {
    return NextResponse.json({ error: 'That company could not be found.' }, { status: 404 });
  }

  const { data: ownerRows } = await client.models.CustomerUser.list({
    filter: { customerId: { eq: accountRequest.customerId }, role: { eq: 'account_owner' } },
    limit: 10,
  });
  const owner = (ownerRows || []).find((row) => row?.email);

  if (owner?.email) {
    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://nulldevice.dev').replace(/\/$/, '');
    const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';
    const customerName = customer.companyName || customer.name;
    try {
      await sesClient.send(
        new SendTemplatedEmailCommand({
          Source: senderEmail,
          Destination: { ToAddresses: [owner.email] },
          Template: accountRequestNotifyTemplateName,
          TemplateData: JSON.stringify({
            customerName,
            requesterName: accountRequest.name || accountRequest.email,
            requesterEmail: accountRequest.email,
            requestedRole: accountRequest.role === 'account_owner' ? 'an account owner' : 'a read-only user',
            reviewUrl: `${appBaseUrl}/customer/account-requests`,
            logoUrl: `${appBaseUrl}/logo.svg`,
            year: String(new Date().getFullYear()),
          }),
        })
      );
    } catch (error) {
      console.error('Error resending account request notification email:', error);
    }
  }

  const now = new Date().toISOString();
  const { data: updated } = await client.models.AccountRequest.update({
    id: accountRequest.id,
    lastNotifiedAt: now,
  });

  return NextResponse.json({ request: updated });
}
