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

import { POST } from '@/app/api/admin/users/route';

jest.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class UsernameExistsException extends Error {
    constructor() {
      super('An account with the given email already exists.');
      this.name = 'UsernameExistsException';
    }
  }

  return {
    CognitoIdentityProviderClient: jest.fn(() => ({
      send: sendMock,
    })),
    ListUsersCommand: jest.fn((input) => ({ input })),
    ListUsersInGroupCommand: jest.fn((input) => ({ input })),
    AdminListGroupsForUserCommand: jest.fn((input) => ({ input })),
    AdminAddUserToGroupCommand: jest.fn((input) => ({ input })),
    AdminRemoveUserFromGroupCommand: jest.fn((input) => ({ input })),
    AdminCreateUserCommand: jest.fn((input) => ({ input })),
    UsernameExistsException,
  };
});

import { UsernameExistsException } from '@aws-sdk/client-cognito-identity-provider';

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

  it('createUser provisions a real Cognito login and adds it to the given group', async () => {
    verifyMock.mockResolvedValue({
      sub: 'sub-123',
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
      }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      user: { sub: 'sub-brand-new', username: 'new@agency.com.au' },
      created: true,
    });
    expect(sendMock).toHaveBeenCalledTimes(2);
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
    });
    expect(sendMock).toHaveBeenCalledTimes(3);
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
});
