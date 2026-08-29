import { randomInt } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  type AdminCreateUserCommandInput,
  AdminListGroupsForUserCommand,
  AdminListUserAuthEventsCommand,
  AdminRemoveUserFromGroupCommand,
  CognitoIdentityProviderClient,
  ListUsersCommand,
  ListUsersInGroupCommand,
  UsernameExistsException,
  UserPoolAddOnNotEnabledException,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import outputs from '@/amplify_outputs.json';
import { sendInvitationEmail } from '@/lib/emails/invitationEmail';

const cognitoClient = new CognitoIdentityProviderClient({});
const userPoolId = process.env.AMPLIFY_COGNITO_USER_POOL_ID || outputs.auth?.user_pool_id;
const userPoolClientId = process.env.AMPLIFY_COGNITO_CLIENT_ID || outputs.auth?.user_pool_client_id;
const graphqlEndpoint = process.env.AMPLIFY_DATA_URL || outputs.data?.url;
const ALLOWED_GROUPS = ['customer', 'operator', 'administrator'] as const;

type AdminUserAction =
  | 'listUsers'
  | 'listUsersInGroup'
  | 'listGroupsForUser'
  | 'addUserToGroup'
  | 'removeUserFromGroup'
  | 'getUserByEmail'
  | 'createUser'
  | 'getUserActivityStats';

type AdminUserRequest = {
  action: AdminUserAction;
  username?: string;
  email?: string;
  name?: string;
  groupName?: (typeof ALLOWED_GROUPS)[number];
  /** createUser only: the customer account name, for the branded invitation email. */
  customerName?: string;
};

type ListedUser = {
  id?: string;
  username?: string;
  enabled?: boolean;
  status?: string;
  name?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  sub?: string;
};

function mapListedUser(user: {
  Username?: string;
  Enabled?: boolean;
  UserStatus?: string;
  UserCreateDate?: Date;
  UserLastModifiedDate?: Date;
  Attributes?: { Name?: string; Value?: string }[];
}): ListedUser {
  const id = getAttributeValue(user.Attributes, 'sub') || user.Username;
  const name =
    getAttributeValue(user.Attributes, 'name') ||
    getAttributeValue(user.Attributes, 'given_name') ||
    user.Username ||
    getAttributeValue(user.Attributes, 'email') ||
    'Unknown user';

  return {
    id,
    username: user.Username,
    enabled: user.Enabled,
    status: user.UserStatus,
    name,
    email: getAttributeValue(user.Attributes, 'email') || undefined,
    createdAt: user.UserCreateDate?.toISOString(),
    updatedAt: user.UserLastModifiedDate?.toISOString(),
    sub: getAttributeValue(user.Attributes, 'sub'),
  };
}

function getAttributeValue(
  attributes: { Name?: string; Value?: string }[] | undefined,
  attributeName: string
): string | undefined {
  return attributes?.find((attribute) => attribute.Name === attributeName)?.Value;
}

type CognitoListedUser = {
  Username?: string;
  Enabled?: boolean;
  UserStatus?: string;
  UserCreateDate?: Date;
  UserLastModifiedDate?: Date;
  Attributes?: { Name?: string; Value?: string }[];
};

/** Cognito ListUsers doesn't support an exact-match email filter, so this
 * paginates a `Filter: email = "..."` query and confirms the exact match
 * client-side (the filter can return case/substring near-matches). */
async function findUserByEmail(poolId: string, email: string): Promise<CognitoListedUser | undefined> {
  const escapedEmail = email.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  let paginationToken: string | undefined;
  let matched: CognitoListedUser | undefined;

  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: poolId,
        Filter: `email = "${escapedEmail}"`,
        Limit: 60,
        PaginationToken: paginationToken,
      } as any)
    );

    matched = (response.Users || []).find(
      (user) => getAttributeValue(user.Attributes, 'email')?.toLowerCase() === email
    );
    paginationToken = (response as any).PaginationToken as string | undefined;
  } while (!matched && paginationToken);

  return matched;
}

/** Paginates ListUsers to completion -- the individual admin actions cap at one
 * page (Limit: 50/60) since they only need a preview, but activity stats need
 * an accurate total across the whole pool. */
async function listAllCognitoUsers(poolId: string): Promise<CognitoListedUser[]> {
  const allUsers: CognitoListedUser[] = [];
  let paginationToken: string | undefined;

  do {
    const response = await cognitoClient.send(
      new ListUsersCommand({
        UserPoolId: poolId,
        Limit: 60,
        PaginationToken: paginationToken,
      } as any)
    );
    allUsers.push(...(response.Users || []));
    paginationToken = (response as any).PaginationToken as string | undefined;
  } while (paginationToken);

  return allUsers;
}

const SIGNED_IN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** True if `username`'s most recent sign-in attempts include a success within
 * the last 7 days. Looks back a few events (not just the latest) since the
 * very latest event for an active user is sometimes a failed MFA/challenge
 * retry rather than the successful sign-in itself. */
async function signedInWithinLast7Days(poolId: string, username: string): Promise<boolean> {
  const response = await cognitoClient.send(
    new AdminListUserAuthEventsCommand({
      UserPoolId: poolId,
      Username: username,
      MaxResults: 5,
    })
  );

  const cutoff = Date.now() - SIGNED_IN_WINDOW_MS;
  return (response.AuthEvents || []).some(
    (event) =>
      event.EventType === 'SignIn' &&
      event.EventResponse === 'Pass' &&
      event.CreationDate &&
      event.CreationDate.getTime() >= cutoff
  );
}

// Character classes for generateTemporaryPassword. Ambiguous glyphs (0/O, 1/l/I)
// are left out so a temp password read off a screen isn't mistyped.
const PW_LOWER = 'abcdefghijkmnpqrstuvwxyz';
const PW_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PW_DIGIT = '23456789';
const PW_SYMBOL = '!@#$%^&*-_=+';

function pickRandom(alphabet: string, count: number): string {
  let out = '';
  for (let i = 0; i < count; i += 1) {
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

/**
 * A 16-char temporary password that satisfies the default Cognito password
 * policy (>= 8 chars, one each of lower/upper/digit/symbol). The
 * class-guaranteeing characters are shuffled so they don't sit in fixed
 * positions. Exported for unit testing.
 */
export function generateTemporaryPassword(): string {
  const chars = (
    pickRandom(PW_LOWER, 5) +
    pickRandom(PW_UPPER, 4) +
    pickRandom(PW_DIGIT, 4) +
    pickRandom(PW_SYMBOL, 3)
  ).split('');

  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Creates a real Cognito login for `email` and adds it to `groupName`. If a user
 * with that email already exists, adds the existing user to the group instead of
 * erroring (a legitimate case: re-inviting, or the person already has an account
 * from a different portal context).
 *
 * By default Cognito auto-generates a temporary password and sends its own
 * built-in invitation email. Pass `sendInvitationEmail: true` for the customer
 * portal invite flows: a temporary password is generated here, Cognito's email
 * is suppressed (`MessageAction: 'SUPPRESS'`), and the returned
 * `temporaryPassword` is handed to `sendInvitationEmail()` so the branded
 * template goes out instead. Only set on a fresh create -- an already-existing
 * user keeps their password and gets no email (same as before).
 *
 * Exported as a plain function (not inlined in the `createUser` action below) so
 * the customer-owner-facing invite route reuses the same Cognito-user
 * provisioning under its own caller-authorization check.
 */
export async function createOrGetCognitoUser({
  poolId,
  email,
  name,
  groupName,
  sendInvitationEmail: suppressCognitoEmail = false,
}: {
  poolId: string;
  email: string;
  name?: string;
  groupName: (typeof ALLOWED_GROUPS)[number];
  sendInvitationEmail?: boolean;
}): Promise<{ sub?: string; username: string; created: boolean; temporaryPassword?: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  let username: string;
  let sub: string | undefined;
  let created: boolean;
  let temporaryPassword: string | undefined;

  try {
    const input: AdminCreateUserCommandInput = {
      UserPoolId: poolId,
      Username: normalizedEmail,
      UserAttributes: [
        { Name: 'email', Value: normalizedEmail },
        { Name: 'email_verified', Value: 'true' },
        ...(name ? [{ Name: 'name', Value: name }] : []),
      ],
    };
    if (suppressCognitoEmail) {
      temporaryPassword = generateTemporaryPassword();
      input.MessageAction = 'SUPPRESS';
      input.TemporaryPassword = temporaryPassword;
    }

    const response = await cognitoClient.send(new AdminCreateUserCommand(input));

    username = response.User?.Username || normalizedEmail;
    sub = getAttributeValue(response.User?.Attributes, 'sub');
    created = true;
  } catch (error) {
    if (!(error instanceof UsernameExistsException)) {
      throw error;
    }

    const existing = await findUserByEmail(poolId, normalizedEmail);
    if (!existing?.Username) {
      throw error;
    }

    username = existing.Username;
    sub = getAttributeValue(existing.Attributes, 'sub');
    created = false;
    // Existing user: no new password issued, so no branded email either.
    temporaryPassword = undefined;
  }

  await cognitoClient.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: poolId,
      Username: username,
      GroupName: groupName,
    })
  );

  return { sub, username, created, temporaryPassword };
}

type VerifiedClaims = {
  sub?: string;
  email?: string;
  name?: string;
  username?: string;
  'cognito:username'?: string;
  'cognito:groups'?: string[];
};

let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null | undefined;
function getVerifier() {
  if (_verifier === undefined) {
    _verifier = userPoolId && userPoolClientId
      ? CognitoJwtVerifier.create({
          userPoolId,
          tokenUse: 'id',
          clientId: userPoolClientId,
        })
      : null;
  }
  return _verifier;
}

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

async function syncAdministratorRecords(authToken: string, users: ListedUser[]) {
  if (!graphqlEndpoint || users.length === 0) {
    return;
  }

  const createMutation = `
    mutation CreateAdministrator($input: CreateAdministratorInput!) {
      createAdministrator(input: $input) {
        id
      }
    }
  `;

  const updateMutation = `
    mutation UpdateAdministrator($input: UpdateAdministratorInput!) {
      updateAdministrator(input: $input) {
        id
      }
    }
  `;

  await Promise.allSettled(
    users.map(async (user) => {
      if (!user.id || !user.name || !user.email) {
        return;
      }

      const input = {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: user.updatedAt || new Date().toISOString(),
      };

      const createResponse = await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authToken,
        },
        body: JSON.stringify({ query: createMutation, variables: { input } }),
        cache: 'no-store',
      });

      const createPayload = await createResponse.json().catch(() => null);
      if (createResponse.ok && createPayload?.errors?.length && !createPayload?.data?.createAdministrator) {
        await fetch(graphqlEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authToken,
          },
          body: JSON.stringify({ query: updateMutation, variables: { input } }),
          cache: 'no-store',
        });
      }
    })
  );
}

/**
 * Upserts an Operator directory record (id = Cognito sub) for each user passed in.
 * Mirrors syncAdministratorRecords above — same reasoning, different model. Called
 * whenever the Drivers screen lists the `operator` Cognito group, so the roster's
 * identity fields (name/email) stay in sync with Cognito without clobbering the
 * driver-specific fields (phone, vehicle, split, etc.) an admin has already filled
 * in on the Drivers screen, since this only sends name/email/role on create and
 * leaves an existing record's other fields untouched.
 */
async function syncOperatorRecords(authToken: string, users: ListedUser[]) {
  if (!graphqlEndpoint || users.length === 0) {
    return;
  }

  const createMutation = `
    mutation CreateOperator($input: CreateOperatorInput!) {
      createOperator(input: $input) {
        id
      }
    }
  `;

  await Promise.allSettled(
    users.map(async (user) => {
      if (!user.id || !user.name || !user.email) {
        return;
      }

      const input = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'staff',
        status: 'onboarding',
        createdAt: user.createdAt || new Date().toISOString(),
        updatedAt: user.updatedAt || new Date().toISOString(),
      };

      // create-only: an existing record (create fails with a duplicate-id error)
      // is left as-is so an admin's edits on the Drivers screen aren't overwritten.
      await fetch(graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authToken,
        },
        body: JSON.stringify({ query: createMutation, variables: { input } }),
        cache: 'no-store',
      });
    })
  );
}

async function verifyToken(token: string): Promise<VerifiedClaims | null> {
  const verifier = getVerifier();
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

      const users = (response.Users || []).map((user) => mapListedUser(user));
      await syncAdministratorRecords(authResult.token, users);

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

    if (body.action === 'listUsersInGroup') {
      if (!body.groupName) {
        return NextResponse.json({ error: 'groupName is required.' }, { status: 400 });
      }

      if (!ALLOWED_GROUPS.includes(body.groupName)) {
        return NextResponse.json({ error: 'Invalid groupName.' }, { status: 400 });
      }

      const response = await cognitoClient.send(
        new ListUsersInGroupCommand({
          UserPoolId: userPoolId,
          GroupName: body.groupName,
          Limit: 60,
        })
      );

      const users = (response.Users || []).map((user) => mapListedUser(user));
      if (body.groupName === 'operator') {
        await syncOperatorRecords(authResult.token, users);
      }

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_access',
        resourceType: 'operator',
        resourceId: authResult.claims.sub || 'unknown',
        action: `list_users_in_group:${body.groupName}`,
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

    if (body.action === 'getUserByEmail') {
      if (!body.email) {
        return NextResponse.json({ error: 'email is required.' }, { status: 400 });
      }

      const email = body.email.trim().toLowerCase();
      const matched = await findUserByEmail(userPoolId, email);

      if (!matched) {
        return NextResponse.json({ error: `No user found for email ${email}.` }, { status: 404 });
      }

      const user = mapListedUser(matched);
      await syncAdministratorRecords(authResult.token, [user]);

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_access',
        resourceType: 'operator',
        resourceId: matched.Username || email,
        action: 'get_user_by_email',
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({ user });
    }

    if (body.action === 'createUser') {
      if (!body.email || !body.groupName) {
        return NextResponse.json({ error: 'email and groupName are required.' }, { status: 400 });
      }

      if (!ALLOWED_GROUPS.includes(body.groupName)) {
        return NextResponse.json({ error: 'Invalid groupName.' }, { status: 400 });
      }

      // Customer invites get the branded invitation email (Cognito's built-in one
      // suppressed); operator/administrator invites keep Cognito's default email.
      const isCustomerInvite = body.groupName === 'customer';
      const { sub, username, created, temporaryPassword } = await createOrGetCognitoUser({
        poolId: userPoolId,
        email: body.email,
        name: body.name,
        groupName: body.groupName,
        sendInvitationEmail: isCustomerInvite,
      });

      let emailSent = false;
      if (isCustomerInvite && created && temporaryPassword) {
        try {
          await sendInvitationEmail({
            toEmail: body.email.trim().toLowerCase(),
            inviteeName: body.name,
            customerName: body.customerName?.trim() || 'your team',
            inviterName: authResult.claims.name || authResult.claims.email || 'Null Device',
            inviterEmail: authResult.claims.email || '',
            temporaryPassword,
          });
          emailSent = true;
        } catch (err) {
          // Non-blocking: the login exists; an admin can re-send from the console.
          console.error('Failed to send branded invitation email:', err);
        }
      }

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_modification',
        resourceType: 'operator',
        resourceId: username,
        action: created ? `create_user:${body.groupName}` : `create_user_existing:${body.groupName}`,
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({ user: { sub, username }, created, emailSent });
    }

    if (body.action === 'getUserActivityStats') {
      const users = await listAllCognitoUsers(userPoolId);
      const pendingInvites = users.filter((user) => user.UserStatus === 'FORCE_CHANGE_PASSWORD').length;

      let signedInLast7Days = 0;
      let signedInStatsAvailable = true;
      try {
        const results = await Promise.all(
          users
            .filter((user): user is CognitoListedUser & { Username: string } => Boolean(user.Username))
            .map((user) => signedInWithinLast7Days(userPoolId, user.Username))
        );
        signedInLast7Days = results.filter(Boolean).length;
      } catch (error) {
        if (error instanceof UserPoolAddOnNotEnabledException) {
          // Advanced security isn't enabled on this user pool (e.g. a sandbox branch
          // whose CDK deploy hasn't caught up yet) -- report unavailable rather than 0.
          signedInStatsAvailable = false;
        } else {
          throw error;
        }
      }

      await writeAuditLog(authResult.token, {
        operatorId: authResult.claims.sub,
        eventType: 'data_access',
        resourceType: 'operator',
        resourceId: authResult.claims.sub || 'unknown',
        action: 'get_user_activity_stats',
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json({
        totalUsers: users.length,
        pendingInvites,
        signedInLast7Days,
        signedInStatsAvailable,
      });
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
