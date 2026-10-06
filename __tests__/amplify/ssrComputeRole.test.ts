/**
 * @jest-environment node
 */
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { importSsrComputeRole } from '@/amplify/shared/ssrComputeRole';

const STACK_SAFE_POLICY_NAME_FLAG = '@aws-cdk/aws-iam:importedRoleStackSafeDefaultPolicyName';

/** The inline policies a branch adds to the shared role, from each import ID, all in one stack. */
function policiesFor(branch: string, ids: string[], stackSafePolicyNames = false) {
  const stack = new Stack(new App({ context: { [STACK_SAFE_POLICY_NAME_FLAG]: stackSafePolicyNames } }), 'data');
  for (const id of ids) {
    const role = importSsrComputeRole(stack, id, branch);
    role.addToPrincipalPolicy(new PolicyStatement({ actions: ['s3:GetObject'], resources: ['*'] }));
  }
  const policies = Template.fromStack(stack).findResources('AWS::IAM::Policy');
  return Object.values(policies).map((p) => ({ name: p.Properties.PolicyName, roles: p.Properties.Roles }));
}

const names = (policies: { name: string }[]) => policies.map((p) => p.name);

describe('importSsrComputeRole', () => {
  it('adds its grants to the shared AmplifyHostingSSRCompute role', () => {
    expect(policiesFor('main', ['Role'])).toEqual([{ name: expect.any(String), roles: ['AmplifyHostingSSRCompute'] }]);
  });

  describe.each([false, true])('with stack-safe default policy names %s', (stackSafePolicyNames) => {
    it('names the inline policy differently on each branch, so one branch never overwrites another', () => {
      const [main] = names(policiesFor('main', ['Role'], stackSafePolicyNames));
      const [development] = names(policiesFor('development', ['Role'], stackSafePolicyNames));
      expect(main).not.toEqual(development);
    });

    it('names each import differently within a branch', () => {
      const policies = names(policiesFor('main', ['RoleA', 'RoleB'], stackSafePolicyNames));
      expect(new Set(policies).size).toBe(2);
    });
  });
});
