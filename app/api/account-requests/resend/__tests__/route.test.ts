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
const accountRequestUpdateMock = jest.fn();
const customerUserListMock = jest.fn();
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
      AccountRequest: { list: accountRequestListMock, update: accountRequestUpdateMock },
      CustomerUser: { list: customerUserListMock },
      Customer: { get: customerGetMock },
    },
  }),
}));

import { POST } from '@/app/api/account-requests/resend/route';

function buildRequest(token = 'token-value') {
  return {
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
  } as any;
}

describe('account-requests resend API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'requester-sub', email: 'priya@rangeproperty.com.au' });
    sesSendMock.mockResolvedValue({});
    customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Range Property' } });
    customerUserListMock.mockResolvedValue({ data: [{ email: 'owner@rangeproperty.com.au', role: 'account_owner' }] });
    accountRequestUpdateMock.mockResolvedValue({ data: { id: 'req-1', lastNotifiedAt: '2026-02-01T02:00:00Z' } });
  });

  it('returns 401 when the token is missing', async () => {
    const response = await POST(buildRequest(''));
    expect(response.status).toBe(401);
  });

  it('returns 404 when the caller has no pending request', async () => {
    accountRequestListMock.mockResolvedValue({ data: [] });
    const response = await POST(buildRequest());
    expect(response.status).toBe(404);
  });

  it('resends the notification when outside the cooldown window', async () => {
    accountRequestListMock.mockResolvedValue({
      data: [{ id: 'req-1', customerId: 'cust-1', email: 'priya@rangeproperty.com.au', requestedAt: '2026-01-01T00:00:00Z' }],
    });

    const response = await POST(buildRequest());
    const payload = await response.json();

    expect(sesSendMock).toHaveBeenCalledTimes(1);
    expect(accountRequestUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'req-1' }));
    expect(response.status).toBe(200);
    expect(payload.request.id).toBe('req-1');
  });

  it('returns 429 when within the cooldown window', async () => {
    accountRequestListMock.mockResolvedValue({
      data: [{ id: 'req-1', customerId: 'cust-1', email: 'priya@rangeproperty.com.au', lastNotifiedAt: new Date().toISOString() }],
    });

    const response = await POST(buildRequest());
    expect(response.status).toBe(429);
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(accountRequestUpdateMock).not.toHaveBeenCalled();
  });

  it('still updates lastNotifiedAt when the customer has no account owner yet', async () => {
    accountRequestListMock.mockResolvedValue({
      data: [{ id: 'req-1', customerId: 'cust-1', email: 'priya@rangeproperty.com.au', requestedAt: '2026-01-01T00:00:00Z' }],
    });
    customerUserListMock.mockResolvedValue({ data: [] });

    const response = await POST(buildRequest());

    expect(sesSendMock).not.toHaveBeenCalled();
    expect(accountRequestUpdateMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});
