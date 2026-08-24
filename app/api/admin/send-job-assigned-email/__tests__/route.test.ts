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
const routeGetMock = jest.fn();
const stopListMock = jest.fn();
const getCustomerMock = jest.fn();

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
      Route: { get: routeGetMock },
      Stop: { list: stopListMock },
    },
  }),
}));

jest.mock('@/lib/queries', () => ({
  getCustomer: (...args: unknown[]) => getCustomerMock(...args),
}));

import { POST } from '@/app/api/admin/send-job-assigned-email/route';

describe('send job-assigned email API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    verifyMock.mockResolvedValue({ 'cognito:groups': ['administrator'] });

    routeGetMock.mockResolvedValue({
      data: {
        id: 'route-1',
        routeCode: 'W25-08-114',
        customerId: 'cust-1',
        assignedOperatorSub: 'sub-operator-1',
        assignedOperatorName: 'Jane',
        assignedOperatorEmail: 'jane@nulldevice.dev',
      },
      errors: undefined,
    });

    stopListMock.mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }] });
    getCustomerMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Beltline Group' }, errors: undefined });
    sesSendMock.mockResolvedValue({ MessageId: 'ses-message-id-1' });
  });

  it('returns 401 when token is missing', async () => {
    const request = {
      headers: new Headers(),
      json: async () => ({ routeId: 'route-1' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it('returns 403 for a non-administrator caller', async () => {
    verifyMock.mockResolvedValue({ 'cognito:groups': ['operator'] });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ routeId: 'route-1' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(403);
  });

  it('returns 400 when the route has no assigned operator email', async () => {
    routeGetMock.mockResolvedValue({
      data: { id: 'route-1', routeCode: 'W25-08-114', customerId: 'cust-1' },
      errors: undefined,
    });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ routeId: 'route-1' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it('sends the job-assigned email to the assigned operator', async () => {
    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ routeId: 'route-1' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        sentTo: 'jane@nulldevice.dev',
        routeCode: 'W25-08-114',
      })
    );

    expect(sesSendMock).toHaveBeenCalledTimes(1);
    const sentCommand = sesSendMock.mock.calls[0][0];
    expect(sentCommand.input.Destination).toEqual({ ToAddresses: ['jane@nulldevice.dev'] });
    const templateData = JSON.parse(sentCommand.input.TemplateData);
    expect(templateData).toEqual(
      expect.objectContaining({
        operatorName: 'Jane',
        routeCode: 'W25-08-114',
        customerName: 'Beltline Group',
        stopCount: '2',
      })
    );
  });
});
