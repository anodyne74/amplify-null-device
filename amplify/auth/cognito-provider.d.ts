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

  export interface ListUsersInGroupCommandInput {
    UserPoolId: string;
    GroupName: string;
    Limit?: number;
    NextToken?: string;
  }

  export interface ListUsersInGroupCommandOutput {
    Users?: UserType[];
    NextToken?: string;
  }

  export interface AdminGetUserCommandInput {
    UserPoolId: string;
    Username: string;
  }

  export interface AdminGetUserCommandOutput {
    Username?: string;
    UserAttributes?: AttributeType[];
    UserCreateDate?: Date;
    UserLastModifiedDate?: Date;
    Enabled?: boolean;
    UserStatus?: string;
  }

  export interface AdminCreateUserCommandInput {
    UserPoolId: string;
    Username: string;
    UserAttributes?: AttributeType[];
    MessageAction?: 'RESEND' | 'SUPPRESS';
    TemporaryPassword?: string;
  }

  export interface AdminCreateUserCommandOutput {
    User?: UserType;
  }

  export interface AdminListUserAuthEventsCommandInput {
    UserPoolId: string;
    Username: string;
    MaxResults?: number;
  }

  export interface AdminSetUserPasswordCommandInput {
    UserPoolId: string;
    Username: string;
    Password: string;
    Permanent?: boolean;
  }

  export interface AdminSetUserPasswordCommandOutput {}

  export interface AuthEventType {
    EventType?: string;
    EventResponse?: string;
    CreationDate?: Date;
  }

  export interface AdminListUserAuthEventsCommandOutput {
    AuthEvents?: AuthEventType[];
  }

  export class UsernameExistsException extends Error {
    readonly name: 'UsernameExistsException';
  }

  export class UserPoolAddOnNotEnabledException extends Error {
    readonly name: 'UserPoolAddOnNotEnabledException';
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

  export class ListUsersInGroupCommand {
    readonly __brand_ListUsersInGroupCommand?: true;
    constructor(input: ListUsersInGroupCommandInput);
  }

  export class AdminGetUserCommand {
    readonly __brand_AdminGetUserCommand?: true;
    constructor(input: AdminGetUserCommandInput);
  }

  export class AdminCreateUserCommand {
    readonly __brand_AdminCreateUserCommand?: true;
    constructor(input: AdminCreateUserCommandInput);
  }

  export class AdminListUserAuthEventsCommand {
    readonly __brand_AdminListUserAuthEventsCommand?: true;
    constructor(input: AdminListUserAuthEventsCommandInput);
  }

  export class AdminSetUserPasswordCommand {
    readonly __brand_AdminSetUserPasswordCommand?: true;
    constructor(input: AdminSetUserPasswordCommandInput);
  }

  export class CognitoIdentityProviderClient {
    constructor(config?: Record<string, unknown>);
    send(command: AdminAddUserToGroupCommand): Promise<void>;
    send(command: AdminRemoveUserFromGroupCommand): Promise<void>;
    send(command: AdminListGroupsForUserCommand): Promise<AdminListGroupsForUserCommandOutput>;
    send(command: ListUsersCommand): Promise<ListUsersCommandOutput>;
    send(command: ListUsersInGroupCommand): Promise<ListUsersInGroupCommandOutput>;
    send(command: AdminGetUserCommand): Promise<AdminGetUserCommandOutput>;
    send(command: AdminCreateUserCommand): Promise<AdminCreateUserCommandOutput>;
    send(command: AdminListUserAuthEventsCommand): Promise<AdminListUserAuthEventsCommandOutput>;
    send(command: AdminSetUserPasswordCommand): Promise<AdminSetUserPasswordCommandOutput>;
  }
}
