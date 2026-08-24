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
const cognitoSendMock = jest.fn();
const accountRequestGetMock = jest.fn();
const accountRequestUpdateMock = jest.fn();
const customerUserListMock = jest.fn();
const customerUserCreateMock = jest.fn();
const customerGetMock = jest.fn();
const customerUpdateMock = jest.fn();
const routeListMock = jest.fn();
const stopListMock = jest.fn();
const invoiceListMock = jest.fn();
const lineItemListMock = jest.fn();
const paymentRecordListMock = jest.fn();

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

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(() => ({ send: cognitoSendMock })),
  AdminAddUserToGroupCommand: jest.fn(function AdminAddUserToGroupCommand(input) {
    this.input = input;
  }),
  AdminListGroupsForUserCommand: jest.fn(function AdminListGroupsForUserCommand(input) {
    this.input = input;
  }),
  ListUsersCommand: jest.fn(function ListUsersCommand(input) {
    this.input = input;
  }),
}));

jest.mock('aws-amplify/data', () => ({
  generateClient: () => ({
    models: {
      AccountRequest: { get: accountRequestGetMock, update: accountRequestUpdateMock },
      CustomerUser: { list: customerUserListMock, create: customerUserCreateMock },
      Customer: { get: customerGetMock, update: customerUpdateMock },
      Route: { list: routeListMock, update: jest.fn() },
      Stop: { list: stopListMock, update: jest.fn() },
      Invoice: { list: invoiceListMock, update: jest.fn() },
      LineItem: { list: lineItemListMock, update: jest.fn() },
      PaymentRecord: { list: paymentRecordListMock, update: jest.fn() },
    },
  }),
}));

import { POST } from '@/app/api/account-requests/decide/route';

function buildRequest(body?: unknown, token = 'token-value') {
  return {
    headers: new Headers(token ? { authorization: `Bearer ${token}` } : {}),
    json: async () => body,
  } as any;
}

const pendingRequest = {
  id: 'req-1',
  requesterSub: 'requester-sub',
  email: 'priya@rangeproperty.com.au',
  name: 'Priya Shah',
  customerId: 'cust-1',
  role: 'read_only',
  status: 'pending',
};

describe('account-requests decide API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'owner-sub', 'cognito:groups': ['customer'] });
    sesSendMock.mockResolvedValue({});
    cognitoSendMock.mockImplementation((command: any) => {
      if (command.input?.Filter) {
        return Promise.resolve({
          Users: [{ Username: 'cognito-username-1', Attributes: [{ Name: 'email', Value: 'priya@rangeproperty.com.au' }] }],
        });
      }
      return Promise.resolve({ Groups: [] });
    });
    accountRequestGetMock.mockResolvedValue({ data: pendingRequest });
    accountRequestUpdateMock.mockResolvedValue({ data: { ...pendingRequest, status: 'approved' } });
    customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Range Property', companyName: 'Range Property Pty Ltd' } });
    customerUserListMock.mockResolvedValue({
      data: [{ userSub: 'owner-sub', customerId: 'cust-1', role: 'account_owner' }],
    });
    customerUserCreateMock.mockResolvedValue({ data: { id: 'cu-1' } });
    customerUpdateMock.mockResolvedValue({ data: {} });
    routeListMock.mockResolvedValue({ data: [] });
    invoiceListMock.mockResolvedValue({ data: [] });
    lineItemListMock.mockResolvedValue({ data: [] });
    paymentRecordListMock.mockResolvedValue({ data: [] });
  });

  it('returns 401 when the token is missing', async () => {
    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'approve' }, ''));
    expect(response.status).toBe(401);
  });

  it('returns 400 when requestId or decision is missing', async () => {
    const response = await POST(buildRequest({ decision: 'approve' }));
    expect(response.status).toBe(400);
  });

  it('returns 404 when the request does not exist', async () => {
    accountRequestGetMock.mockResolvedValue({ data: null });
    const response = await POST(buildRequest({ requestId: 'nope', decision: 'approve' }));
    expect(response.status).toBe(404);
  });

  it('returns 400 when the request was already decided', async () => {
    accountRequestGetMock.mockResolvedValue({ data: { ...pendingRequest, status: 'approved' } });
    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'approve' }));
    expect(response.status).toBe(400);
  });

  it('returns 403 when the caller is not an admin or the account owner of this customer', async () => {
    customerUserListMock.mockResolvedValue({ data: [] });
    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'approve' }));
    expect(response.status).toBe(403);
  });

  it('rejects the request, records the decision, and emails the requester', async () => {
    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'reject', note: 'Not a match.' }));
    const payload = await response.json();

    expect(accountRequestUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'req-1', status: 'rejected', decidedByUserSub: 'owner-sub', decisionNote: 'Not a match.' })
    );
    expect(customerUserCreateMock).not.toHaveBeenCalled();
    expect(sesSendMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(payload.request).toBeDefined();
  });

  it('approves a read-only request, adds the group, creates CustomerUser, and syncs viewerSubs', async () => {
    const ownerRow = { userSub: 'owner-sub', customerId: 'cust-1', role: 'account_owner' };
    customerUserListMock.mockReset();
    customerUserListMock.mockResolvedValueOnce({ data: [ownerRow] }); // authorization check
    customerUserListMock.mockResolvedValueOnce({ data: [ownerRow] }); // existingRows (owner/duplicate check)
    customerUserListMock.mockResolvedValueOnce({
      data: [ownerRow, { userSub: 'requester-sub', customerId: 'cust-1', role: 'read_only' }],
    }); // allRows after CustomerUser.create, feeding the viewerSubs sync

    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'approve' }));

    expect(cognitoSendMock).toHaveBeenCalled();
    expect(customerUserCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        userSub: 'requester-sub',
        role: 'read_only',
        accountOwnerSub: 'owner-sub',
      })
    );
    expect(customerUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cust-1', viewerSubs: expect.arrayContaining(['owner-sub', 'requester-sub']) })
    );
    expect(accountRequestUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    expect(sesSendMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it('rejects a read-only approval when the customer has no account owner yet', async () => {
    customerUserListMock.mockResolvedValueOnce({ data: [{ userSub: 'owner-sub', customerId: 'cust-1', role: 'account_owner' }] });
    customerUserListMock.mockResolvedValueOnce({ data: [] });

    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'approve' }));
    expect(response.status).toBe(400);
    expect(customerUserCreateMock).not.toHaveBeenCalled();
  });

  it('rejects an account_owner approval when the customer already has a different owner', async () => {
    accountRequestGetMock.mockResolvedValue({ data: { ...pendingRequest, role: 'account_owner' } });
    customerUserListMock.mockResolvedValueOnce({ data: [{ userSub: 'owner-sub', customerId: 'cust-1', role: 'account_owner' }] });
    customerUserListMock.mockResolvedValueOnce({
      data: [{ userSub: 'someone-else-sub', customerId: 'cust-1', role: 'account_owner' }],
    });

    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'approve' }));
    expect(response.status).toBe(400);
    expect(customerUserCreateMock).not.toHaveBeenCalled();
  });

  it('allows an administrator to decide requests for any customer', async () => {
    verifyMock.mockResolvedValue({ sub: 'admin-sub', 'cognito:groups': ['administrator'] });
    customerUserListMock.mockResolvedValueOnce({ data: [] });

    const response = await POST(buildRequest({ requestId: 'req-1', decision: 'reject' }));
    expect(response.status).toBe(200);
  });
});
