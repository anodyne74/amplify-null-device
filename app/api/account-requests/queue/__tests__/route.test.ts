jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
const accountRequestListMock = jest.fn();
const customerUserListMock = jest.fn();
const customerGetMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      AccountRequest: { list: accountRequestListMock },
      CustomerUser: { list: customerUserListMock },
      Customer: { get: customerGetMock },
    },
  }),
}));

import { GET } from '@/app/api/account-requests/queue/route';

function buildRequest(token = 'token-value') {
  return {
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
  } as any;
}

describe('account-requests queue API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Range Property' } });
  });

  it('returns 401 when the token is missing', async () => {
    const response = await GET(buildRequest(''));
    expect(response.status).toBe(401);
  });

  it('returns 403 when a non-admin caller owns no customer', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-1', 'cognito:groups': ['customer'] });
    customerUserListMock.mockResolvedValue({ data: [] });

    const response = await GET(buildRequest());
    expect(response.status).toBe(403);
  });

  it("scopes results to the account owner's own customers", async () => {
    verifyMock.mockResolvedValue({ sub: 'owner-sub', 'cognito:groups': ['customer'] });
    customerUserListMock.mockResolvedValue({ data: [{ customerId: 'cust-1' }] });
    accountRequestListMock.mockResolvedValue({
      data: [
        { id: 'req-1', customerId: 'cust-1', status: 'pending', requestedAt: '2026-01-02T00:00:00Z' },
        { id: 'req-2', customerId: 'cust-2', status: 'pending', requestedAt: '2026-01-01T00:00:00Z' },
      ],
    });

    const response = await GET(buildRequest());
    const payload = await response.json();

    expect(payload.requests).toHaveLength(1);
    expect(payload.requests[0].id).toBe('req-1');
    expect(payload.requests[0].customerName).toBe('Range Property');
  });

  it('returns every request for an administrator, sorted most recent first', async () => {
    verifyMock.mockResolvedValue({ sub: 'admin-sub', 'cognito:groups': ['administrator'] });
    accountRequestListMock.mockResolvedValue({
      data: [
        { id: 'req-old', customerId: 'cust-1', status: 'pending', requestedAt: '2026-01-01T00:00:00Z' },
        { id: 'req-new', customerId: 'cust-1', status: 'pending', requestedAt: '2026-02-01T00:00:00Z' },
      ],
    });

    const response = await GET(buildRequest());
    const payload = await response.json();

    expect(customerUserListMock).not.toHaveBeenCalled();
    expect(payload.requests.map((r: { id: string }) => r.id)).toEqual(['req-new', 'req-old']);
  });
});
