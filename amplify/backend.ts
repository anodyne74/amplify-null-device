import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { CfnUserPoolGroup } from 'aws-cdk-lib/aws-cognito';

/**
 * @see https://docs.amplify.aws/react/build-a-backend/ to add storage, functions, and more
 */
const backend = defineBackend({
  auth,
  data,
});

// CDK escape hatch: explicitly declare all Cognito groups so they are
// guaranteed to exist on every deployment. Groups were moved out of
// defineAuth to avoid potential CDK diff/cache issues. Logical IDs are
// stable so CloudFormation updates (not replaces) on each deploy.
const { userPool } = backend.auth.resources;

const groups = [
  { name: 'customer', precedence: 0 },
  { name: 'operator', precedence: 1 },
  { name: 'administrator', precedence: 2 },
] as const;

for (const group of groups) {
  new CfnUserPoolGroup(
    backend.auth.resources.userPool.stack,
    `BackendEnsuredGroup${group.name.charAt(0).toUpperCase()}${group.name.slice(1)}`,
    {
      userPoolId: userPool.userPoolId,
      groupName: group.name,
      precedence: group.precedence,
    }
  );
}
