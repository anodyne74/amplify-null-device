/**
 * Minimal ambient declarations for @aws-sdk/client-cognito-identity-provider.
 * The full package is provided by the Lambda Node.js 18 runtime at deploy time.
 * These stubs exist only to satisfy the TypeScript compiler during local builds.
 */
declare module '@aws-sdk/client-cognito-identity-provider' {
  export interface AdminAddUserToGroupCommandInput {
    UserPoolId: string;
    Username: string;
    GroupName: string;
  }

  export class AdminAddUserToGroupCommand {
    constructor(input: AdminAddUserToGroupCommandInput);
  }

  export class CognitoIdentityProviderClient {
    constructor(config?: Record<string, unknown>);
    send(command: AdminAddUserToGroupCommand): Promise<void>;
  }
}
