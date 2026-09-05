import type { PostAuthenticationTriggerHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { getAmplifyDataClientConfig } from '@aws-amplify/backend/function/runtime';
import type { Schema } from '../../data/resource';

type RuntimeDataEnv = {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SESSION_TOKEN: string;
  AWS_REGION: string;
  AMPLIFY_DATA_DEFAULT_NAME: string;
};

let configuredClient: ReturnType<typeof generateClient<Schema>> | null = null;

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

/**
 * Admin-created Operator accounts (AdminCreateUserCommand) never fire postConfirmation
 * -- that only fires for self-service ConfirmSignUp, which staff invites skip entirely.
 * postAuthentication does fire on every successful sign-in including a staff member's
 * first one after their forced password change, so it's the reliable place to flip an
 * Operator record from its 'onboarding' default to 'active' once identity is confirmed.
 */
export const handler: PostAuthenticationTriggerHandler = async (event) => {
  const userSub = event.request.userAttributes?.sub?.trim();
  if (!userSub) {
    return event;
  }

  const client = await getDataClient();
  const { data: operator } = await client.models.Operator.get({ id: userSub });

  if (operator?.status === 'onboarding') {
    await client.models.Operator.update({ id: userSub, status: 'active' });
  }

  return event;
};
