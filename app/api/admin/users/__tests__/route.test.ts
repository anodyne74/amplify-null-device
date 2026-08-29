jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const sendMock = jest.fn();
const verifyMock = jest.fn();
const sendInvitationEmailMock = jest.fn();

import { POST, generateTemporaryPassword } from '@/app/api/admin/users/route';

jest.mock('@/lib/emails/invitationEmail', () => ({
  sendInvitationEmail: (...args: unknown[]) => sendInvitationEmailMock(...args),
}));

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class UsernameExistsException extends Error {
    constructor() {
      super('An account with the given email already exists.');
      this.name = 'UsernameExistsException';
    }
  }

  class UserPoolAddOnNotEnabledException extends Error {
    constructor() {
      super('This action is not enabled for the user pool.');
      this.name = 'UserPoolAddOnNotEnabledException';
    }
  }

  return {
    CognitoIdentityProviderClient: jest.fn(() => ({
      send: sendMock,
    })),
    ListUsersCommand: jest.fn((input) => ({ input })),
    ListUsersInGroupCommand: jest.fn((input) => ({ input })),
    AdminListGroupsForUserCommand: jest.fn((input) => ({ input })),
    AdminListUserAuthEventsCommand: jest.fn((input) => ({ input })),
    AdminAddUserToGroupCommand: jest.fn((input) => ({ input })),
    AdminRemoveUserFromGroupCommand: jest.fn((input) => ({ input })),
    AdminCreateUserCommand: jest.fn((input) => ({ input })),
    UsernameExistsException,
    UserPoolAddOnNotEnabledException,
  };
});

import { UsernameExistsException, UserPoolAddOnNotEnabledException } from '@aws-sdk/client-cognito-identity-provider';

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({
      verify: verifyMock,
    })),
  },
}));

describe('admin users API', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as any);
    sendInvitationEmailMock.mockResolvedValue(undefined);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns 401 when token is missing', async () => {
    const request = {
      headers: new Headers(),
      json: async () => ({ action: 'listUsers' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Missing authorization token.' });
  });

  it('blocks self removal of administrator group', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({
        action: 'removeUserFromGroup',
        username: 'admin-user',
        groupName: 'administrator',
      }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'Removing your own administrator role is not allowed.',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('adds user to group for administrator', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });
    sendMock.mockResolvedValue({});

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({
        action: 'addUserToGroup',
        username: 'operator-2',
        groupName: 'operator',
      }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(sendMock).toHaveBeenCalled();
  });

  it('lists users in a group for operator assignment', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock.mockResolvedValue({
      Users: [
        {
          Username: 'operator-1',
          Attributes: [
            { Name: 'email', Value: 'jane@nulldevice.dev' },
            { Name: 'sub', Value: 'sub-operator-1' },
            { Name: 'name', Value: 'Jane' },
          ],
        },
      ],
    });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ action: 'listUsersInGroup', groupName: 'operator' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.users).toEqual([
      expect.objectContaining({ name: 'Jane', email: 'jane@nulldevice.dev', sub: 'sub-operator-1' }),
    ]);

    // Listing the operator group also upserts the Operator directory (Driver roster) --
    // id is the genuine Cognito sub, not the Username.
    const operatorSyncCall = (global.fetch as jest.Mock).mock.calls.find(([, init]) =>
      String(init?.body || '').includes('createOperator')
    );
    expect(operatorSyncCall).toBeDefined();
    const syncBody = JSON.parse(operatorSyncCall![1].body);
    expect(syncBody.variables.input).toEqual(
      expect.objectContaining({ id: 'sub-operator-1', name: 'Jane', email: 'jane@nulldevice.dev' })
    );
  });

  it('does not sync the Operator directory when listing a different group', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock.mockResolvedValue({
      Users: [
        {
          Username: 'customer-1',
          Attributes: [
            { Name: 'email', Value: 'owner@harcourts.example' },
            { Name: 'sub', Value: 'sub-customer-1' },
            { Name: 'name', Value: 'Betty' },
          ],
        },
      ],
    });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ action: 'listUsersInGroup', groupName: 'customer' }),
    } as any;

    await POST(request);

    const operatorSyncCall = (global.fetch as jest.Mock).mock.calls.find(([, init]) =>
      String(init?.body || '').includes('createOperator')
    );
    expect(operatorSyncCall).toBeUndefined();
  });

  it('rejects listUsersInGroup with an invalid groupName', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ action: 'listUsersInGroup', groupName: 'not-a-group' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('resolves user by email for customer access assignment', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock.mockResolvedValue({
      Users: [
        {
          Username: 'customer-user',
          Attributes: [
            { Name: 'email', Value: 'ellisa.bannyan@mcgrath.com.au' },
            { Name: 'sub', Value: 'sub-customer-1' },
            { Name: 'name', Value: 'Ellisa' },
          ],
        },
      ],
      PaginationToken: undefined,
    });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({
        action: 'getUserByEmail',
        email: 'Ellisa.Bannyan@mcgrath.com.au',
      }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: expect.objectContaining({
        username: 'customer-user',
        email: 'ellisa.bannyan@mcgrath.com.au',
        sub: 'sub-customer-1',
      }),
    });
    expect(sendMock).toHaveBeenCalled();
  });

  it('createUser provisions a real Cognito login, suppresses the Cognito email, and sends the branded invitation', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      email: 'admin@nulldevice.dev',
      name: 'Admin Person',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock
      .mockResolvedValueOnce({
        User: {
          Username: 'new@agency.com.au',
          Attributes: [{ Name: 'sub', Value: 'sub-brand-new' }],
        },
      })
      .mockResolvedValueOnce({});

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({
        action: 'createUser',
        email: 'new@agency.com.au',
        name: 'New Agent',
        groupName: 'customer',
        customerName: 'Agency Co',
      }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { sub: 'sub-brand-new', username: 'new@agency.com.au' },
      created: true,
      emailSent: true,
    });
    expect(sendMock).toHaveBeenCalledTimes(2);

    const createUserInput = sendMock.mock.calls[0][0].input;
    expect(createUserInput.MessageAction).toBe('SUPPRESS');
    expect(typeof createUserInput.TemporaryPassword).toBe('string');
    expect(createUserInput.TemporaryPassword.length).toBeGreaterThanOrEqual(8);

    expect(sendInvitationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: 'new@agency.com.au',
        inviteeName: 'New Agent',
        customerName: 'Agency Co',
        inviterName: 'Admin Person',
        inviterEmail: 'admin@nulldevice.dev',
        temporaryPassword: createUserInput.TemporaryPassword,
      })
    );
  });

  it('createUser does not suppress the Cognito email or send a branded invite for non-customer groups', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock
      .mockResolvedValueOnce({
        User: { Username: 'ops@nulldevice.dev', Attributes: [{ Name: 'sub', Value: 'sub-ops' }] },
      })
      .mockResolvedValueOnce({});

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({
        action: 'createUser',
        email: 'ops@nulldevice.dev',
        groupName: 'operator',
      }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(sendMock.mock.calls[0][0].input.MessageAction).toBeUndefined();
    expect(sendMock.mock.calls[0][0].input.TemporaryPassword).toBeUndefined();
    expect(sendInvitationEmailMock).not.toHaveBeenCalled();
  });

  it('createUser adds an already-existing Cognito user to the group instead of erroring', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock
      .mockRejectedValueOnce(new UsernameExistsException())
      .mockResolvedValueOnce({
        Users: [
          {
            Username: 'existing-user',
            Attributes: [
              { Name: 'email', Value: 'already@agency.com.au' },
              { Name: 'sub', Value: 'sub-existing' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({});

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({
        action: 'createUser',
        email: 'already@agency.com.au',
        groupName: 'customer',
      }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { sub: 'sub-existing', username: 'existing-user' },
      created: false,
      emailSent: false,
    });
    expect(sendMock).toHaveBeenCalledTimes(3);
    expect(sendInvitationEmailMock).not.toHaveBeenCalled();
  });

  it('rejects createUser with an invalid groupName', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ action: 'createUser', email: 'x@y.com', groupName: 'not-a-group' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('computes user activity stats: pending invites and signed-in-within-7-days count', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock
      .mockResolvedValueOnce({
        Users: [
          { Username: 'userA', UserStatus: 'CONFIRMED', Attributes: [] },
          { Username: 'userB', UserStatus: 'FORCE_CHANGE_PASSWORD', Attributes: [] },
        ],
        PaginationToken: undefined,
      })
      .mockResolvedValueOnce({
        AuthEvents: [{ EventType: 'SignIn', EventResponse: 'Pass', CreationDate: new Date() }],
      })
      .mockResolvedValueOnce({ AuthEvents: [] });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ action: 'getUserActivityStats' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalUsers: 2,
      pendingInvites: 1,
      signedInLast7Days: 1,
      signedInStatsAvailable: true,
    });
  });

  it('reports signed-in stats as unavailable when advanced security is not enabled on the user pool', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
      'cognito:username': 'admin-user',
      'cognito:groups': ['administrator'],
    });

    sendMock
      .mockResolvedValueOnce({
        Users: [{ Username: 'userA', UserStatus: 'CONFIRMED', Attributes: [] }],
        PaginationToken: undefined,
      })
      .mockRejectedValueOnce(new UserPoolAddOnNotEnabledException());

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ action: 'getUserActivityStats' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      totalUsers: 1,
      pendingInvites: 0,
      signedInLast7Days: 0,
      signedInStatsAvailable: false,
    });
  });
});

describe('generateTemporaryPassword', () => {
  it('produces a 16-char password with all four Cognito character classes', () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(16);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[0-9]/);
      expect(pw).toMatch(/[^A-Za-z0-9]/);
    }
  });

  it('does not return the same password twice', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(generateTemporaryPassword());
    expect(seen.size).toBe(100);
  });
});
