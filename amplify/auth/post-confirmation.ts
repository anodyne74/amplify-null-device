import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const cognitoClient = new CognitoIdentityProviderClient();

/**
 * Post-confirmation trigger: automatically adds every confirmed sign-up to
 * the "customer" group so new users receive baseline access immediately.
 * Operators must be added to the "operator" group manually by an admin.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  if (event.triggerSource === 'PostConfirmation_ConfirmSignUp') {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: event.userPoolId,
        Username: event.userName,
        GroupName: 'customer',
      })
    );
  }
  return event;
};
