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
const customerUpdateMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      CustomerUser: { list: customerUserListMock },
      Customer: { update: customerUpdateMock },
    },
  }),
}));

import { POST } from '@/app/api/customer/sync-profile-access/route';

describe('customer sync-profile-access API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'sub-owner-1', 'cognito:groups': ['customer'] });

    customerUserListMock.mockImplementation(({ filter }: { filter: { userSub?: { eq: string }; customerId?: { eq: string } } }) => {
      if (filter.userSub) {
        return Promise.resolve({ data: [{ customerId: 'cust-1', role: 'account_owner', userSub: 'sub-owner-1' }] });
      }
      return Promise.resolve({
        data: [
          { customerId: 'cust-1', role: 'account_owner', userSub: 'sub-owner-1' },
          { customerId: 'cust-1', role: 'read_only', userSub: 'sub-readonly-1' },
        ],
      });
    });

    customerUpdateMock.mockResolvedValue({ data: {}, errors: undefined });
  });

  it('returns 401 when token is missing', async () => {
    const request = { headers: new Headers(), json: async () => ({}) } as any;
    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-customer caller', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['operator'] });
    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({}),
    } as any;
    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('syncs viewerSubs and accountOwnerSub for the caller customer', async () => {
    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({}),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, customerId: 'cust-1' });

    expect(customerUpdateMock).toHaveBeenCalledWith({
      id: 'cust-1',
      viewerSubs: ['sub-owner-1', 'sub-readonly-1'],
      accountOwnerSub: 'sub-owner-1',
    });
  });

  it('returns 404 when no customer mapping exists', async () => {
    customerUserListMock.mockResolvedValue({ data: [] });
    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({}),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(customerUpdateMock).not.toHaveBeenCalled();
  });
});
