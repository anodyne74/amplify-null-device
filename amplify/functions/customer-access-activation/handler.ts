import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { SendTemplatedEmailCommand, SESClient } from '@aws-sdk/client-ses';
import type { Schema } from '../../data/resource';

const PENDING_SUB_PREFIX = 'pending:';
const cognitoClient = new CognitoIdentityProviderClient({});
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
const defaultWelcomeTemplateName = branchName
  ? `NullDeviceWelcomeTemplate-${branchName}`
  : 'NullDeviceWelcomeTemplate';
const welcomeTemplateName = process.env.SES_WELCOME_TEMPLATE_NAME || defaultWelcomeTemplateName;

async function sendWelcomeEmail(recipientEmail: string, customerName: string) {
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://nulldevice.dev').replace(/\/$/, '');
  const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply.nulldevice.dev';

  try {
    await sesClient.send(
      new SendTemplatedEmailCommand({
        Source: senderEmail,
        Destination: { ToAddresses: [recipientEmail] },
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
    // Non-blocking: activation must succeed even if the welcome email fails to send.
    console.error('Error sending welcome email:', error);
  }
}
type RuntimeDataEnv = {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN: string;
  AWS_REGION: string;
  AMPLIFY_DATA_DEFAULT_NAME: string;
};

let configuredClient: ReturnType<typeof generateClient<Schema>> | null = null;

function isPendingSub(userSub: string | null | undefined) {
  return Boolean(userSub && userSub.startsWith(PENDING_SUB_PREFIX));
}

async function getDataClient() {
  if (configuredClient) {
    return configuredClient;
  }

  const { resourceConfig, libraryOptions } = await getAmplifyDataClientConfig(
    process.env as unknown as RuntimeDataEnv
  );
  Amplify.configure(resourceConfig, libraryOptions);
  configuredClient = generateClient<Schema>();
  return configuredClient;
}

async function ensureCustomerGroup(userPoolId: string, username: string) {
  const groupsResponse = await cognitoClient.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: username,
    })
  );

  const groups = (groupsResponse.Groups || []).map((group) => group.GroupName).filter(Boolean);
  if (!groups.includes('customer')) {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: 'customer',
      })
    );
  }
}

async function syncViewerSubsForCustomer(customerId: string, viewerSubs: string[]) {
  const client = await getDataClient();
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

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const userSub = event.request.userAttributes?.sub?.trim();
  const email = event.request.userAttributes?.email?.trim().toLowerCase();
  const username = event.userName;

  if (!userSub || !email || !username || !event.userPoolId) {
    return event;
  }

  const client = await getDataClient();
  const pendingSubForEmail = `${PENDING_SUB_PREFIX}${email}`;

  const { data: matches, errors: listErrors } = await client.models.CustomerUser.list({
    filter: { email: { eq: email } },
    limit: 1000,
  });

  if (listErrors?.length || !matches || matches.length === 0) {
    return event;
  }

  const pendingRows = matches.filter(
    (row) => row?.id && isPendingSub(row.userSub) && (row.userSub === pendingSubForEmail || row.email?.toLowerCase() === email)
  );

  if (pendingRows.length === 0) {
    return event;
  }

  await ensureCustomerGroup(event.userPoolId, username);

  const affectedCustomerIds = new Set<string>();
  const ownerSubRekeys = new Map<string, Set<string>>();

  for (const row of pendingRows) {
    if (!row.id || !row.customerId || !row.userSub) continue;

    const oldPendingSub = row.userSub;
    if (row.role === 'account_owner') {
      if (!ownerSubRekeys.has(row.customerId)) {
        ownerSubRekeys.set(row.customerId, new Set());
      }
      ownerSubRekeys.get(row.customerId)?.add(oldPendingSub);
    }

    affectedCustomerIds.add(row.customerId);
    await client.models.CustomerUser.update({
      id: row.id,
      userSub,
      accountOwnerSub: row.role === 'account_owner' ? userSub : row.accountOwnerSub,
      email,
      updatedAt: new Date().toISOString(),
    });
  }

  for (const [customerId, ownerPendingSubs] of ownerSubRekeys.entries()) {
    const { data: rows } = await client.models.CustomerUser.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
    });

    for (const row of rows || []) {
      if (!row?.id || !row.accountOwnerSub || !ownerPendingSubs.has(row.accountOwnerSub)) continue;
      await client.models.CustomerUser.update({
        id: row.id,
        accountOwnerSub: userSub,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  if (ownerSubRekeys.size > 0) {
    const [customerId] = ownerSubRekeys.keys();
    const { data: customer } = await client.models.Customer.get({ id: customerId });
    await sendWelcomeEmail(email, customer?.companyName || customer?.name || 'there');
  }

  for (const customerId of affectedCustomerIds) {
    const { data: rows } = await client.models.CustomerUser.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
    });

    const viewerSubs = [
      ...new Set(
        (rows || [])
          .map((row) => row.userSub?.trim())
          .filter((value): value is string => Boolean(value) && !value.startsWith(PENDING_SUB_PREFIX))
      ),
    ];

    const accountOwnerRow = (rows || []).find(
      (row) => row.role === 'account_owner' && !isPendingSub(row.userSub)
    );

    await syncViewerSubsForCustomer(customerId, viewerSubs);
    await client.models.Customer.update({
      id: customerId,
      viewerSubs,
      accountOwnerSub: accountOwnerRow?.userSub || undefined,
    });
  }

  return event;
};
