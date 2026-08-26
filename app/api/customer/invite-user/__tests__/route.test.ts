jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
const customerUserListMock = jest.fn();
const customerUserCreateMock = jest.fn();
const customerGetMock = jest.fn();
const customerUpdateMock = jest.fn();
const routeListMock = jest.fn();
const routeUpdateMock = jest.fn();
const stopListMock = jest.fn();
const stopUpdateMock = jest.fn();
const invoiceListMock = jest.fn();
const invoiceUpdateMock = jest.fn();
const lineItemListMock = jest.fn();
const lineItemUpdateMock = jest.fn();
const paymentRecordListMock = jest.fn();
const paymentRecordUpdateMock = jest.fn();
const createOrGetCognitoUserMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      CustomerUser: { list: customerUserListMock, create: customerUserCreateMock },
      Customer: { get: customerGetMock, update: customerUpdateMock },
      Route: { list: routeListMock, update: routeUpdateMock },
      Stop: { list: stopListMock, update: stopUpdateMock },
      Invoice: { list: invoiceListMock, update: invoiceUpdateMock },
      LineItem: { list: lineItemListMock, update: lineItemUpdateMock },
      PaymentRecord: { list: paymentRecordListMock, update: paymentRecordUpdateMock },
    },
  }),
}));

jest.mock('@/app/api/admin/users/route', () => ({
  createOrGetCognitoUser: (...args: unknown[]) => createOrGetCognitoUserMock(...args),
}));

import { POST } from '@/app/api/customer/invite-user/route';

function makeRequest(body: Record<string, unknown>) {
  return {
    headers: new Headers({ authorization: 'Bearer token-value' }),
    json: async () => body,
  } as any;
}

describe('customer invite-user API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'sub-owner-1', 'cognito:groups': ['customer'] });

    customerUserListMock.mockImplementation(
      ({ filter }: { filter: { userSub?: { eq: string }; customerId?: { eq: string } } }) => {
        if (filter.userSub) {
          return Promise.resolve({
            data: [{ customerId: 'cust-1', role: 'account_owner', userSub: 'sub-owner-1' }],
          });
        }
        return Promise.resolve({
          data: [{ customerId: 'cust-1', role: 'account_owner', userSub: 'sub-owner-1', email: 'owner@rangeproperty.com.au' }],
        });
      }
    );

    customerGetMock.mockResolvedValue({
      data: { id: 'cust-1', email: 'owner@rangeproperty.com.au', restrictInvitesToOwnDomain: false },
    });
    customerUserCreateMock.mockResolvedValue({ data: { id: 'cu-new' }, errors: undefined });
    customerUpdateMock.mockResolvedValue({ data: {}, errors: undefined });
    routeListMock.mockResolvedValue({ data: [] });
    routeUpdateMock.mockResolvedValue({ data: {}, errors: undefined });
    stopListMock.mockResolvedValue({ data: [] });
    stopUpdateMock.mockResolvedValue({ data: {}, errors: undefined });
    invoiceListMock.mockResolvedValue({ data: [] });
    invoiceUpdateMock.mockResolvedValue({ data: {}, errors: undefined });
    lineItemListMock.mockResolvedValue({ data: [] });
    lineItemUpdateMock.mockResolvedValue({ data: {}, errors: undefined });
    paymentRecordListMock.mockResolvedValue({ data: [] });
    paymentRecordUpdateMock.mockResolvedValue({ data: {}, errors: undefined });

    createOrGetCognitoUserMock.mockResolvedValue({ sub: 'sub-new-teammate', username: 'teammate@rangeproperty.com.au', created: true });
  });

  it('returns 401 when token is missing', async () => {
    const request = { headers: new Headers(), json: async () => ({}) } as any;
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-customer caller', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['operator'] });
    const response = await POST(makeRequest({ email: 'teammate@rangeproperty.com.au' }));
    expect(response.status).toBe(403);
  });

  it('returns 403 when the caller is read_only, not account_owner', async () => {
    customerUserListMock.mockImplementation(({ filter }: { filter: { userSub?: { eq: string } } }) => {
      if (filter.userSub) {
        return Promise.resolve({ data: [{ customerId: 'cust-1', role: 'read_only', userSub: 'sub-owner-1' }] });
      }
      return Promise.resolve({ data: [] });
    });

    const response = await POST(makeRequest({ email: 'teammate@rangeproperty.com.au' }));
    expect(response.status).toBe(403);
    expect(createOrGetCognitoUserMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a missing/invalid email', async () => {
    const response = await POST(makeRequest({ email: 'not-an-email' }));
    expect(response.status).toBe(400);
  });

  it('rejects an invite outside the required domain when restriction is on', async () => {
    customerGetMock.mockResolvedValue({
      data: { id: 'cust-1', email: 'owner@rangeproperty.com.au', restrictInvitesToOwnDomain: true },
    });

    const response = await POST(makeRequest({ email: 'teammate@other-company.com' }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/rangeproperty\.com\.au/);
    expect(createOrGetCognitoUserMock).not.toHaveBeenCalled();
  });

  it('allows an invite matching the required domain when restriction is on', async () => {
    customerGetMock.mockResolvedValue({
      data: { id: 'cust-1', email: 'owner@rangeproperty.com.au', restrictInvitesToOwnDomain: true },
    });

    const response = await POST(makeRequest({ email: 'teammate@rangeproperty.com.au' }));
    expect(response.status).toBe(200);
    expect(createOrGetCognitoUserMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'teammate@rangeproperty.com.au', groupName: 'customer' })
    );
  });

  it('rejects a duplicate invite to an existing teammate', async () => {
    customerUserListMock.mockImplementation(({ filter }: { filter: { userSub?: { eq: string } } }) => {
      if (filter.userSub) {
        return Promise.resolve({ data: [{ customerId: 'cust-1', role: 'account_owner', userSub: 'sub-owner-1' }] });
      }
      return Promise.resolve({
        data: [
          { customerId: 'cust-1', role: 'account_owner', userSub: 'sub-owner-1', email: 'owner@rangeproperty.com.au' },
          { customerId: 'cust-1', role: 'read_only', userSub: 'sub-existing', email: 'teammate@rangeproperty.com.au' },
        ],
      });
    });

    const response = await POST(makeRequest({ email: 'teammate@rangeproperty.com.au' }));
    expect(response.status).toBe(409);
    expect(createOrGetCognitoUserMock).not.toHaveBeenCalled();
  });

  it('creates a real Cognito login and a read_only CustomerUser row, attributed to the calling owner', async () => {
    const response = await POST(makeRequest({ email: 'teammate@rangeproperty.com.au', name: 'Jamie Teammate' }));
    expect(response.status).toBe(200);

    expect(createOrGetCognitoUserMock).toHaveBeenCalledWith({
      poolId: expect.anything(),
      email: 'teammate@rangeproperty.com.au',
      name: 'Jamie Teammate',
      groupName: 'customer',
    });

    expect(customerUserCreateMock).toHaveBeenCalledWith({
      customerId: 'cust-1',
      userSub: 'sub-new-teammate',
      accountOwnerSub: 'sub-owner-1',
      role: 'read_only',
      name: 'Jamie Teammate',
      email: 'teammate@rangeproperty.com.au',
    });
  });

  it('passes through UsernameExistsException reuse from the shared helper unchanged', async () => {
    createOrGetCognitoUserMock.mockResolvedValue({ sub: 'sub-existing-user', username: 'teammate@rangeproperty.com.au', created: false });

    const response = await POST(makeRequest({ email: 'teammate@rangeproperty.com.au' }));
    expect(response.status).toBe(200);
    expect(customerUserCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ userSub: 'sub-existing-user' })
    );
  });

  it('returns 404 when the caller has no customer mapping', async () => {
    customerUserListMock.mockResolvedValue({ data: [] });
    const response = await POST(makeRequest({ email: 'teammate@rangeproperty.com.au' }));
    expect(response.status).toBe(404);
    expect(createOrGetCognitoUserMock).not.toHaveBeenCalled();
  });
});
