jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
const syncCustomerAccessMock = jest.fn();
const iamClient = { models: {} };

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

jest.mock('@/lib/customerAccess', () => ({
  syncCustomerAccess: (...args: unknown[]) => syncCustomerAccessMock(...args),
}));

import { POST } from '@/app/api/admin/sync-customer-access/route';

function makeRequest(body: Record<string, unknown>) {
  return {
    headers: new Headers({ authorization: 'Bearer token-value' }),
    json: async () => body,
  } as any;
}

describe('admin sync-customer-access API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'sub-admin', 'cognito:groups': ['administrator'] });
    syncCustomerAccessMock.mockResolvedValue({ updated: { Customer: 1 }, errors: [] });
  });

  it('returns 401 when token is missing', async () => {
    const response = await POST({ headers: new Headers(), json: async () => ({}) } as any);
    expect(response.status).toBe(401);
    expect(syncCustomerAccessMock).not.toHaveBeenCalled();
  });

  it('returns 403 for a customer caller', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['customer'] });
    const response = await POST(makeRequest({ customerId: 'cust-1' }));
    expect(response.status).toBe(403);
    expect(syncCustomerAccessMock).not.toHaveBeenCalled();
  });

  it('returns 400 without a customerId', async () => {
    const response = await POST(makeRequest({}));
    expect(response.status).toBe(400);
  });

  it('syncs with the IAM client, passing the added/removed hint through', async () => {
    const response = await POST(makeRequest({ customerId: 'cust-1', removed: 'sub-gone' }));

    expect(response.status).toBe(200);
    expect(syncCustomerAccessMock).toHaveBeenCalledWith(iamClient, 'cust-1', { added: undefined, removed: 'sub-gone' });
  });

  it('returns 500 when the sync reports errors', async () => {
    syncCustomerAccessMock.mockResolvedValue({ updated: {}, errors: [{ message: 'boom' }] });
    const response = await POST(makeRequest({ customerId: 'cust-1' }));
    expect(response.status).toBe(500);
  });
});
