import { defineAuth } from '@aws-amplify/backend';
import { customerAccessActivation } from '../functions/customer-access-activation/resource';
import { operatorStatusActivation } from '../functions/operator-status-activation/resource';

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
    postAuthentication: operatorStatusActivation,
  },
  /**
   * Cognito User Groups:
   * - administrator: superusers with full access; must be added manually by an admin
   * - operator: staff members; must be added manually by an admin
   * - customer: assigned by an administrator when a signup request is approved
   *
   * Order matters: Amplify assigns group precedence by array index (lower index =
   * lower precedence number = higher priority). If a user ever ends up in more than
   * one group, the Identity Pool grants AWS credentials for exactly one group's IAM
   * role — the one with the lowest precedence number. Listing groups most-privileged
   * first ensures a multi-group user always resolves to their highest-privilege role,
   * rather than silently being downgraded to e.g. read-only customer S3 permissions.
   */
  groups: ['administrator', 'operator', 'customer'],
});

