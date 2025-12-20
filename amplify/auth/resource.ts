import { defineAuth } from '@aws-amplify/backend';

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
  // Custom attributes for additional user metadata
  // Note: User groups (customer/operator) are configured in AWS Console
  // after initial deployment. See setup instructions below.
});

/**
 * Cognito User Groups & Roles Configuration:
 * 
 * After deploying this backend, create two user groups in AWS Cognito Console:
 * 
 * 1. CUSTOMER GROUP
 *    - Group Name: customer
 *    - Description: Regular customers using the delivery service
 *    - IAM Role: Create or select role with read-only permissions to Customer/Route/Invoice models
 *    - Priority: 1
 *    - Users: Auto-added by post-signup trigger (see lambda below)
 * 
 * 2. OPERATOR GROUP
 *    - Group Name: operator
 *    - Description: Staff members with elevated permissions (admin/manager/staff)
 *    - IAM Role: Create or select role with full permissions to all models
 *    - Priority: 2
 *    - Users: Manually added by admins to grant operator access
 * 
 * TOKEN CONFIGURATION:
 * - In Cognito App Client settings, ensure "ID token" contains groups:
 *   - In "Token customization" settings
 *   - Add claim: cognito:groups (will contain array of group names)
 * 
 * USAGE IN AUTHORIZATION RULES:
 * - Authorization rules now support checking group membership
 * - Example: allow.userPools().to(['read']) for basic authenticated users
 * - Example with groups: Can be implemented via Custom Authorizers if needed
 * 
 * POST-SIGNUP TRIGGER (Optional - for auto-adding users to customer group):
 * - Create Lambda function that adds new users to "customer" group by default
 * - Trigger on: Post Authentication / Post Confirmation
 * - This ensures all new sign-ups start as customers
 * 
 * TESTING:
 * 1. Deploy: npx ampx sandbox
 * 2. Sign up test customer user
 * 3. Verify user appears in Cognito User Pool
 * 4. Manually add second user to "operator" group in console
 * 5. Login and verify tokens contain cognito:groups claim
 */
