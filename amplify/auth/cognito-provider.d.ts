/**
 * Minimal ambient declarations for @aws-sdk/client-cognito-identity-provider.
 * The full package is provided by the Lambda Node.js 18 runtime at deploy time.
 * These stubs exist only to satisfy the TypeScript compiler during local builds.
 */
declare module '@aws-sdk/client-cognito-identity-provider' {
  export interface AttributeType {
    Name?: string;
    Value?: string;
  }

  export interface UserType {
    Username?: string;
    Enabled?: boolean;
    UserStatus?: string;
    Attributes?: AttributeType[];
  }

  export interface GroupType {
    GroupName?: string;
    Description?: string;
  }

  export interface AdminAddUserToGroupCommandInput {
    UserPoolId: string;
    Username: string;
    GroupName: string;
  }

  export interface AdminRemoveUserFromGroupCommandInput {
    UserPoolId: string;
    Username: string;
    GroupName: string;
  }

  export interface AdminListGroupsForUserCommandInput {
    UserPoolId: string;
    Username: string;
  }

  export interface AdminListGroupsForUserCommandOutput {
    Groups?: GroupType[];
  }

  export interface ListUsersCommandInput {
    UserPoolId: string;
    Limit?: number;
  }

  export interface ListUsersCommandOutput {
    Users?: UserType[];
  }

  export class AdminAddUserToGroupCommand {
    readonly __brand_AdminAddUserToGroupCommand?: true;
    constructor(input: AdminAddUserToGroupCommandInput);
  }

  export class AdminRemoveUserFromGroupCommand {
    readonly __brand_AdminRemoveUserFromGroupCommand?: true;
    constructor(input: AdminRemoveUserFromGroupCommandInput);
  }

  export class AdminListGroupsForUserCommand {
    readonly __brand_AdminListGroupsForUserCommand?: true;
    constructor(input: AdminListGroupsForUserCommandInput);
  }

  export class ListUsersCommand {
    readonly __brand_ListUsersCommand?: true;
    constructor(input: ListUsersCommandInput);
  }

  export class CognitoIdentityProviderClient {
    constructor(config?: Record<string, unknown>);
    send(command: AdminAddUserToGroupCommand): Promise<void>;
    send(command: AdminRemoveUserFromGroupCommand): Promise<void>;
    send(command: AdminListGroupsForUserCommand): Promise<AdminListGroupsForUserCommandOutput>;
    send(command: ListUsersCommand): Promise<ListUsersCommandOutput>;
  }
}
