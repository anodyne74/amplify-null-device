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
      Route: { list: routeListMock, update: routeUpdateMock },
      Stop: { list: stopListMock, update: stopUpdateMock },
      Invoice: { list: invoiceListMock, update: invoiceUpdateMock },
      LineItem: { list: lineItemListMock, update: lineItemUpdateMock },
      PaymentRecord: { list: paymentRecordListMock, update: paymentRecordUpdateMock },
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

  it('backfills viewerSubs onto Route, Stop, Invoice, LineItem and PaymentRecord', async () => {
    routeListMock.mockResolvedValue({ data: [{ id: 'route-1' }] });
    stopListMock.mockResolvedValue({ data: [{ id: 'stop-1' }] });
    invoiceListMock.mockResolvedValue({ data: [{ id: 'inv-1' }] });
    lineItemListMock.mockResolvedValue({ data: [{ id: 'li-1' }] });
    paymentRecordListMock.mockResolvedValue({ data: [{ id: 'pay-1' }] });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({}),
    } as any;

    await POST(request);

    const expectedViewerSubs = ['sub-owner-1', 'sub-readonly-1'];
    expect(routeUpdateMock).toHaveBeenCalledWith({ id: 'route-1', viewerSubs: expectedViewerSubs });
    expect(stopUpdateMock).toHaveBeenCalledWith({ id: 'stop-1', viewerSubs: expectedViewerSubs });
    expect(invoiceUpdateMock).toHaveBeenCalledWith({ id: 'inv-1', viewerSubs: expectedViewerSubs });
    expect(lineItemUpdateMock).toHaveBeenCalledWith({ id: 'li-1', viewerSubs: expectedViewerSubs });
    expect(paymentRecordUpdateMock).toHaveBeenCalledWith({ id: 'pay-1', viewerSubs: expectedViewerSubs });
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
