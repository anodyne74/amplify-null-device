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
const syncCustomerAccessMock = jest.fn();
const iamClient = { models: { CustomerUser: { list: customerUserListMock } } };

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

// lib/server/iamDataClient re-exports generateClient's return value wired
// with real IAM credentials -- mocked wholesale here so tests never import
// its @aws-sdk/credential-provider-node dependency (which pulls in an
// ESM-only build jest's CJS transform can't load).
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

jest.mock('@/lib/customerAccess', () => ({
  syncCustomerAccess: (...args: unknown[]) => syncCustomerAccessMock(...args),
}));

import { POST } from '@/app/api/customer/sync-profile-access/route';

describe('customer sync-profile-access API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'sub-owner-1', 'cognito:groups': ['customer'] });

    customerUserListMock.mockResolvedValue({
      data: [{ customerId: 'cust-1', role: 'account_owner', userSub: 'sub-owner-1' }],
    });
    syncCustomerAccessMock.mockResolvedValue({ updated: {}, errors: [] });
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

  it("syncs access for the caller's own customer", async () => {
    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({}),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, customerId: 'cust-1' });
    expect(customerUserListMock).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { userSub: { eq: 'sub-owner-1' } } })
    );
    expect(syncCustomerAccessMock).toHaveBeenCalledWith(iamClient, 'cust-1');
  });

  it('returns 500 when the sync reports errors, so the portal retries next visit', async () => {
    syncCustomerAccessMock.mockResolvedValue({ updated: {}, errors: [{ message: 'boom' }] });
    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({}),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(500);
  });

  it('returns 404 when no customer mapping exists', async () => {
    customerUserListMock.mockResolvedValue({ data: [] });
    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({}),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(404);
    expect(syncCustomerAccessMock).not.toHaveBeenCalled();
  });
});
