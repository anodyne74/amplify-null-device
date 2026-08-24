jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
const sesSendMock = jest.fn();
const accountRequestListMock = jest.fn();
const accountRequestCreateMock = jest.fn();
const customerUserListMock = jest.fn();
const customerListMock = jest.fn();
const customerGetMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: sesSendMock })),
  SendTemplatedEmailCommand: jest.fn(function SendTemplatedEmailCommand(input) {
    this.input = input;
  }),
}));

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      AccountRequest: { list: accountRequestListMock, create: accountRequestCreateMock },
      CustomerUser: { list: customerUserListMock },
      Customer: { list: customerListMock, get: customerGetMock },
    },
  }),
}));

import { GET, POST } from '@/app/api/account-requests/route';

function buildRequest(body?: unknown, token = 'token-value') {
  return {
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
    json: async () => body,
  } as any;
}

describe('account-requests API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'requester-sub-1', email: 'priya@rangeproperty.com.au' });
    sesSendMock.mockResolvedValue({});
    accountRequestListMock.mockResolvedValue({ data: [] });
    accountRequestCreateMock.mockResolvedValue({
      data: { id: 'req-1', status: 'pending' },
      errors: undefined,
    });
    customerUserListMock.mockResolvedValue({
      data: [{ email: 'owner@rangeproperty.com.au', role: 'account_owner' }],
    });
    customerListMock.mockResolvedValue({
      data: [{ id: 'cust-1', name: 'Range Property' }],
    });
    customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Range Property' } });
  });

  describe('GET', () => {
    it('returns 401 when the token is missing', async () => {
      const response = await GET(buildRequest(undefined, ''));
      expect(response.status).toBe(401);
    });

    it("returns the caller's most recent request and the customer picker list", async () => {
      accountRequestListMock.mockResolvedValue({
        data: [
          { id: 'req-old', requestedAt: '2026-01-01T00:00:00Z', status: 'rejected' },
          { id: 'req-new', requestedAt: '2026-02-01T00:00:00Z', status: 'pending' },
        ],
      });

      const response = await GET(buildRequest());
      const payload = await response.json();

      expect(payload.request.id).toBe('req-new');
      expect(payload.customers).toEqual([{ id: 'cust-1', name: 'Range Property' }]);
    });

    it('returns a null request when the caller has none yet', async () => {
      const response = await GET(buildRequest());
      const payload = await response.json();
      expect(payload.request).toBeNull();
    });
  });

  describe('POST', () => {
    it('returns 401 when the token is missing', async () => {
      const response = await POST(buildRequest({ customerId: 'cust-1', role: 'read_only' }, ''));
      expect(response.status).toBe(401);
    });

    it('returns 400 when customerId or role is missing', async () => {
      const response = await POST(buildRequest({ role: 'read_only' }));
      expect(response.status).toBe(400);
    });

    it('returns 404 when the company does not exist', async () => {
      customerGetMock.mockResolvedValue({ data: null });

      const response = await POST(buildRequest({ customerId: 'nope', role: 'read_only' }));
      expect(response.status).toBe(404);
    });

    it('creates the request and notifies the account owner by email', async () => {
      const response = await POST(
        buildRequest({ customerId: 'cust-1', role: 'account_owner', name: 'Priya Shah' })
      );
      const payload = await response.json();

      expect(accountRequestCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requesterSub: 'requester-sub-1',
          email: 'priya@rangeproperty.com.au',
          name: 'Priya Shah',
          customerId: 'cust-1',
          role: 'account_owner',
          status: 'pending',
        })
      );
      expect(sesSendMock).toHaveBeenCalledTimes(1);
      expect(payload.request.id).toBe('req-1');
    });

    it('returns the existing pending request instead of creating a duplicate', async () => {
      accountRequestListMock.mockResolvedValue({
        data: [{ id: 'req-existing', status: 'pending' }],
      });

      const response = await POST(buildRequest({ customerId: 'cust-1', role: 'read_only' }));
      const payload = await response.json();

      expect(accountRequestCreateMock).not.toHaveBeenCalled();
      expect(payload.request.id).toBe('req-existing');
    });

    it('still succeeds without sending an email when the company has no account owner yet', async () => {
      customerUserListMock.mockResolvedValue({ data: [] });

      const response = await POST(buildRequest({ customerId: 'cust-1', role: 'read_only' }));

      expect(response.status).toBe(200);
      expect(sesSendMock).not.toHaveBeenCalled();
    });
  });
});
