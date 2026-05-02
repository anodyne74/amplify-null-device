import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAddUserToGroupCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import outputs from '@/amplify_outputs.json';

const cognitoClient = new CognitoIdentityProviderClient({});
const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;
const graphqlEndpoint = process.env.AMPLIFY_DATA_URL || outputs.data?.url;
const ALLOWED_GROUPS = ['customer', 'operator', 'administrator'] as const;

type AdminUserAction = 'listUsers' | 'listGroupsForUser' | 'addUserToGroup' | 'removeUserFromGroup';

type AdminUserRequest = {
  action: AdminUserAction;
  username?: string;
  groupName?: (typeof ALLOWED_GROUPS)[number];
};

function getAttributeValue(
  attributes: { Name?: string; Value?: string }[] | undefined,
  attributeName: string
): string | undefined {
  return attributes?.find((attribute) => attribute.Name === attributeName)?.Value;
}

type VerifiedClaims = {
  sub?: string;
  email?: string;
  username?: string;
  'cognito:username'?: string;
  'cognito:groups'?: string[];
};

const verifier = userPoolId && userPoolClientId
  ? CognitoJwtVerifier.create({
      userPoolId,
      tokenUse: 'id',
      clientId: userPoolClientId,
    })
  : null;

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length).trim();
}

async function writeAuditLog(authToken: string, input: {
  operatorId?: string;
  eventType: 'login' | 'logout' | 'access_denied' | 'data_access' | 'data_modification' | 'data_deletion';
  resourceType: 'customer' | 'route' | 'invoice' | 'payment' | 'operator';
  resourceId: string;
  action: string;
  status: 'success' | 'failure';
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  if (!graphqlEndpoint) {
    return;
  }

  const mutation = `
    mutation CreateAuditLog($input: CreateAuditLogInput!) {
      createAuditLog(input: $input) {
        id
      }
    }
  `;

  try {
    await fetch(graphqlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            ...input,
            timestamp: new Date().toISOString(),
          },
        },
      }),
      cache: 'no-store',
    });
  } catch {
    // Intentionally non-blocking.
  }
}

async function verifyToken(token: string): Promise<VerifiedClaims | null> {
  if (!verifier) {
    return null;
  }

  try {
    return (await verifier.verify(token)) as VerifiedClaims;
  } catch {
    return null;
  }
}

async function ensureAdmin(request: NextRequest): Promise<{ claims: VerifiedClaims; token: string } | { response: NextResponse }> {
  const token = getBearerToken(request);
  if (!token) {
    return { response: NextResponse.json({ error: 'Missing authorization token.' }, { status: 401 }) };
  }

  const claims = await verifyToken(token);
  if (!claims) {
    return { response: NextResponse.json({ error: 'Invalid authorization token.' }, { status: 401 }) };
  }

  const groups = Array.isArray(claims['cognito:groups']) ? claims['cognito:groups'] : [];
  if (!groups.includes('administrator')) {
    const forwardedFor = request.headers.get('x-forwarded-for') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    await writeAuditLog(token, {
      operatorId: claims.sub,
      eventType: 'access_denied',
      resourceType: 'operator',
      resourceId: claims.sub || 'unknown',
      action: 'admin_user_management_attempt',
      status: 'failure',
      reason: 'Administrator role required.',
      ipAddress: forwardedFor,
      userAgent,
    });
    return { response: NextResponse.json({ error: 'Administrator role required.' }, { status: 403 }) };
  }

  return { claims, token };
}

export async function POST(request: NextRequest) {
  const authResult = await ensureAdmin(request);
  if ('response' in authResult) {
    return authResult.response;
  }

  if (!userPoolId) {
    return NextResponse.json(
      { error: 'Missing AMPLIFY_COGNITO_USER_POOL_ID environment variable.' },
      { status: 500 }
    );
  }

  let body: AdminUserRequest;
  try {
    body = (await request.json()) as AdminUserRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    if (body.action === 'listUsers') {
      const response = await cognitoClient.send(
        new ListUsersCommand({
          UserPoolId: userPoolId,
          Limit: 50,
        })
      );

      const users = (response.Users || []).map((user) => ({
        username: user.Username,
        enabled: user.Enabled,
        status: user.UserStatus,
        firstName: getAttributeValue(user.Attributes, 'given_name'),
        email: getAttributeValue(user.Attributes, 'email'),
      }));

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_access',
        resourceType: 'operator',
        resourceId: authResult.claims.sub || 'unknown',
        action: 'list_users',
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({ users });
    }

    if (body.action === 'listGroupsForUser') {
      if (!body.username) {
        return NextResponse.json({ error: 'username is required.' }, { status: 400 });
      }

      const response = await cognitoClient.send(
        new AdminListGroupsForUserCommand({
          UserPoolId: userPoolId,
          Username: body.username,
        })
      );

      const groups = (response.Groups || []).map((group) => group.GroupName).filter(Boolean);

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_access',
        resourceType: 'operator',
        resourceId: body.username,
        action: 'list_groups_for_user',
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({ groups });
    }

    if (body.action === 'addUserToGroup') {
      if (!body.username || !body.groupName) {
        return NextResponse.json({ error: 'username and groupName are required.' }, { status: 400 });
      }

      if (!ALLOWED_GROUPS.includes(body.groupName)) {
        return NextResponse.json({ error: 'Invalid groupName.' }, { status: 400 });
      }

      await cognitoClient.send(
        new AdminAddUserToGroupCommand({
          UserPoolId: userPoolId,
          Username: body.username,
          GroupName: body.groupName,
        })
      );

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_modification',
        resourceType: 'operator',
        resourceId: body.username,
        action: `add_user_to_group:${body.groupName}`,
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({ success: true });
    }

    if (body.action === 'removeUserFromGroup') {
      if (!body.username || !body.groupName) {
        return NextResponse.json({ error: 'username and groupName are required.' }, { status: 400 });
      }

      const actorUsername = authResult.claims['cognito:username'] || authResult.claims.username;
      if (body.groupName === 'administrator' && actorUsername && actorUsername === body.username) {
        return NextResponse.json(
          { error: 'Removing your own administrator role is not allowed.' },
          { status: 400 }
        );
      }

      if (!ALLOWED_GROUPS.includes(body.groupName)) {
        return NextResponse.json({ error: 'Invalid groupName.' }, { status: 400 });
      }

      await cognitoClient.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: userPoolId,
          Username: body.username,
          GroupName: body.groupName,
        })
      );

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_modification',
        resourceType: 'operator',
        resourceId: body.username,
        action: `remove_user_from_group:${body.groupName}`,
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error.';

    await writeAuditLog(authResult.token, {
      operatorId: authResult.claims.sub,
      eventType: 'data_modification',
      resourceType: 'operator',
      resourceId: body.username || authResult.claims.sub || 'unknown',
      action: `failed_admin_user_action:${body.action}`,
      status: 'failure',
      reason: message,
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
