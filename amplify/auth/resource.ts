import { defineAuth, defineFunction } from '@aws-amplify/backend';

const postConfirmation = defineFunction({
  entry: './post-confirmation.ts',
});

/**
 * Define and configure your auth resource
 * Supports email-based authentication with custom attributes for role management
 * and Cognito user groups for role-based access control
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  triggers: {
    postConfirmation,
  },
  access: (allow) => [allow.resource(postConfirmation).to(['addUserToGroup'])],
});

