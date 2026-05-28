import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import type { Schema } from '../../data/resource';

const PENDING_SUB_PREFIX = 'pending:';
const cognitoClient = new CognitoIdentityProviderClient({});
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

    await syncViewerSubsForCustomer(customerId, viewerSubs);
  }

  return event;
};
