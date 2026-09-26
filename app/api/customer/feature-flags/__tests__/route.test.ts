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
const getOnFlagsMock = jest.fn();
const iamClient = { models: { CustomerUser: { list: customerUserListMock } } };

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

// Mocked wholesale so tests never import @aws-sdk/credential-provider-node
// (ESM-only, which jest's CJS transform can't load).
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

jest.mock('@/lib/server/featureFlags', () => ({
  getOnFlagsForCustomer: (...args: unknown[]) => getOnFlagsMock(...args),
}));

import { POST } from '@/app/api/customer/feature-flags/route';

function makeRequest() {
  return { headers: new Headers({ authorization: 'Bearer token-value' }), json: async () => ({}) } as any;
}

describe('customer feature-flags API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'sub-user-1', 'cognito:groups': ['customer'] });
    customerUserListMock.mockResolvedValue({ data: [{ customerId: 'cust-1', userSub: 'sub-user-1' }] });
    getOnFlagsMock.mockResolvedValue(['alpha']);
  });

  it('returns 401 when the token is missing', async () => {
    const response = await POST({ headers: new Headers(), json: async () => ({}) } as any);
    expect(response.status).toBe(401);
    expect(getOnFlagsMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a caller who is not a customer', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-op', 'cognito:groups': ['operator'] });
    const response = await POST(makeRequest());
    expect(response.status).toBe(403);
    expect(getOnFlagsMock).not.toHaveBeenCalled();
  });

  it("returns only the on-flag names for the caller's own Customer", async () => {
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ flags: ['alpha'] });
    expect(customerUserListMock).toHaveBeenCalledWith(
      expect.objectContaining({ filter: { userSub: { eq: 'sub-user-1' } } })
    );
    expect(getOnFlagsMock).toHaveBeenCalledWith(iamClient, 'cust-1');
  });

  it('returns no flags when the caller has no Customer mapping', async () => {
    customerUserListMock.mockResolvedValue({ data: [] });
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ flags: [] });
    expect(getOnFlagsMock).not.toHaveBeenCalled();
  });

  it('returns no flags when resolving the Customer throws', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    customerUserListMock.mockRejectedValue(new Error('network down'));
    const response = await POST(makeRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ flags: [] });
  });
});
