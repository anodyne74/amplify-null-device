import { defineAuth } from '@aws-amplify/backend';

/**
 * Define and configure your auth resource
 * Supports email-based authentication with custom attributes for role management
 * @see https://docs.amplify.aws/gen2/build-a-backend/auth
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  // Note: Custom attributes for operator role can be added via Cognito console
  // or through post-signup Lambda trigger to assign users to groups
});

/**
 * Cognito Groups Configuration (manual setup required):
 * 
 * Two user groups should be created in Cognito User Pool for role-based access:
 * 
 * 1. customer (default group)
 *    - Description: Regular customers using the delivery service
 *    - Priority: 1
 *    - Members: All newly registered users automatically
 * 
 * 2. operator (admin/manager/staff)
 *    - Description: Staff members with elevated permissions
 *    - Priority: 2
 *    - Members: Manually added by admins
 * 
 * Group claim in ID token: "cognito:groups"
 * Usage in authorization rules: allow.authenticated('userRole')
 */
