import { defineAuth } from '@aws-amplify/backend';
import { customerAccessActivation } from '../functions/customer-access-activation/resource';

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
    postConfirmation: customerAccessActivation,
  },
  /**
   * Cognito User Groups:
   * - customer: assigned by an administrator when a signup request is approved
   * - operator: staff members; must be added manually by an admin
   * - administrator: superusers with full access; must be added manually by an admin
   */
  groups: ['customer', 'operator', 'administrator'],
});

