import { Role, type IRole } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';
import { branchName } from './branch';

/**
 * AmplifyHostingSSRCompute is the single IAM role Amplify Hosting creates once
 * per AWS account/region and shares across every branch's SSR runtime, so it's
 * imported by name. Grants to an imported role land in an inline policy named
 * from its construct path, which is the same on every branch: without the
 * branch in the name, whichever branch deploys last overwrites the other's
 * grants on the shared role (#418). The ID stays in the name too, so imports
 * in different stacks of one branch don't collide either (#351), whichever way
 * CDK's stack-safe policy name flag is set.
 */
export function importSsrComputeRole(scope: Construct, id: string, branch = branchName): IRole {
	return Role.fromRoleName(scope, id, 'AmplifyHostingSSRCompute', { defaultPolicyName: `${id}Policy-${branch}` });
}
