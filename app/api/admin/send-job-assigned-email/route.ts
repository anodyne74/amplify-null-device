import { NextRequest, NextResponse } from 'next/server';
import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';
import { getCustomer } from '@/lib/queries';

const sesClient = new SESClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });

function sanitizeNamePart(value: string, fallback: string) {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

const branchName = sanitizeNamePart(process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || '', '');
const defaultJobAssignedTemplateName = branchName
  ? `NullDeviceJobAssignedTemplate-${branchName}`
  : 'NullDeviceJobAssignedTemplate';
const jobAssignedTemplateName = process.env.SES_JOB_ASSIGNED_TEMPLATE_NAME || defaultJobAssignedTemplateName;
const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;

let _client: ReturnType<typeof generateClient<Schema>> | null = null;
function getDataClient() {
  if (!_client) _client = generateClient<Schema>();
  return _client;
}

type VerifiedClaims = {
  sub?: string;
  email?: string;
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
    if (!userGroups.includes('administrator')) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { routeId } = body;

    if (!routeId) {
      return NextResponse.json({ error: 'routeId is required' }, { status: 400 });
    }

    const { data: route, errors: routeErrors } = await getDataClient().models.Route.get({ id: routeId });
    if (routeErrors || !route) {
      console.error('Route fetch errors:', routeErrors);
      return NextResponse.json({ error: 'Route not found' }, { status: 404 });
    }

    if (!route.assignedOperatorEmail) {
      return NextResponse.json({ error: 'Route has no assigned operator email' }, { status: 400 });
    }

    const customerResult = await getCustomer(route.customerId);
    const customer = customerResult.data as { name?: string | null } | null;

    const { data: stops } = await getDataClient().models.Stop.list({
      filter: { routeId: { eq: routeId } },
      limit: 1000,
    });

    const configuredLogoUrl = process.env.SES_EMAIL_LOGO_URL?.trim();
    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    const resolvedAppBaseUrl = (appBaseUrl || 'https://nulldevice.dev').replace(/\/$/, '');
    const logoUrl = configuredLogoUrl ? configuredLogoUrl : `${resolvedAppBaseUrl}/logo.svg`;

    const templateData = {
      operatorName: route.assignedOperatorName || 'there',
      routeCode: route.routeCode || route.id,
      customerName: customer?.name || 'a customer',
      stopCount: String((stops || []).length),
      routeUrl: `${resolvedAppBaseUrl}/operator/routes/detail?id=${routeId}`,
      logoUrl,
      year: `${new Date().getUTCFullYear()}`,
    };

    const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';

    let messageId: string;
    try {
      const result = await sesClient.send(
        new SendTemplatedEmailCommand({
          Source: senderEmail,
          Destination: { ToAddresses: [route.assignedOperatorEmail] },
          Template: jobAssignedTemplateName,
          TemplateData: JSON.stringify(templateData),
        })
      );
      messageId = result.MessageId || '';
      console.log(`Job-assigned email sent to ${route.assignedOperatorEmail}, MessageId: ${messageId}`);
    } catch (err) {
      console.error('SES send failed:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return NextResponse.json({ error: `Failed to send email: ${errorMessage}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messageId,
      sentTo: route.assignedOperatorEmail,
      routeCode: route.routeCode,
    });
  } catch (err) {
    console.error('Unexpected error in send-job-assigned-email:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
