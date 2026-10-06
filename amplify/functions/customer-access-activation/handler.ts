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
import { listAll } from '../../../lib/listAll';
import { syncCustomerAccess } from '../../../lib/customerAccess';

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
  // Unlike Amplify Console's app/branch env vars, NEXT_PUBLIC_APP_URL and
  // SES_SENDER_EMAIL aren't auto-injected into this function -- amplify/backend.ts
  // wires both explicitly (branch-derived) via addEnvironment, so these literal
  // fallbacks are only reached if that wiring is ever removed.
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://nulldevice.com.au').replace(/\/$/, '');
  const senderEmail = process.env.SES_SENDER_EMAIL || 'no-reply@nulldevice.com.au';

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

export const handler: PostConfirmationTriggerHandler = async (event) => {
  const userSub = event.request.userAttributes?.sub?.trim();
  const email = event.request.userAttributes?.email?.trim().toLowerCase();
  const username = event.userName;

  if (!userSub || !email || !username || !event.userPoolId) {
    return event;
  }

  const client = await getDataClient();
  const pendingSubForEmail = `${PENDING_SUB_PREFIX}${email}`;

  const { data: matches, errors: listErrors } = await listAll(client, 'CustomerUser', {
    filter: { email: { eq: email } },
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
    const { data: rows } = await listAll(client, 'CustomerUser', {
      filter: { customerId: { eq: customerId } },
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

  // The re-keyed rows were written moments ago and `list` is eventually
  // consistent, so pass the new sub as a hint. Errors are logged by the sync;
  // activation still succeeds and sync-profile-access repairs on first visit.
  for (const customerId of affectedCustomerIds) {
    await syncCustomerAccess(client, customerId, { added: userSub });
  }

  return event;
};
