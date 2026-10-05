/**
 * @jest-environment node
 */
import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { importSsrComputeRole } from '@/amplify/shared/ssrComputeRole';

function policyNamesFor(branch: string) {
  const stack = new Stack(new App(), 'data');
  const role = importSsrComputeRole(stack, 'AmplifyHostingSSRComputeRole', branch);
  role.addToPrincipalPolicy(new PolicyStatement({ actions: ['s3:GetObject'], resources: ['*'] }));
  const policies = Template.fromStack(stack).findResources('AWS::IAM::Policy');
  return Object.values(policies).map((p) => ({ name: p.Properties.PolicyName, roles: p.Properties.Roles }));
}

describe('importSsrComputeRole', () => {
  it('adds its grants to the shared AmplifyHostingSSRCompute role', () => {
    expect(policyNamesFor('main')).toEqual([{ name: expect.any(String), roles: ['AmplifyHostingSSRCompute'] }]);
  });

  it('names the inline policy differently on each branch, so one branch never overwrites another', () => {
    const [main] = policyNamesFor('main');
    const [development] = policyNamesFor('development');
    expect(main.name).not.toEqual(development.name);
  });
});
