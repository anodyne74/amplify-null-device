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
const customerGetMock = jest.fn();
const operatorGetMock = jest.fn();
const auditCreateMock = jest.fn();
const smsSendMock = jest.fn();
const customOutputs: Record<string, string | undefined> = {};

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

jest.mock('@aws-sdk/client-pinpoint-sms-voice-v2', () => ({
  PinpointSMSVoiceV2Client: jest.fn(() => ({ send: smsSendMock })),
  SendTextMessageCommand: jest.fn(function SendTextMessageCommand(input) {
    this.input = input;
  }),
}));

jest.mock('@/lib/amplifyOutputsCustom', () => ({ customOutputs }));

// lib/server/iamDataClient re-exports generateClient's return value wired
// with real IAM credentials -- mocked wholesale here so tests never import
// its @aws-sdk/credential-provider-node dependency (which pulls in an
// ESM-only build jest's CJS transform can't load).
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => ({
    models: {
      Route: { get: routeGetMock },
      Stop: { list: stopListMock },
      Customer: { get: customerGetMock },
      Operator: { get: operatorGetMock },
      AuditLog: { create: auditCreateMock },
    },
  }),
}));

import { POST } from '@/app/api/admin/send-job-assigned-email/route';

const notify = () =>
  POST({
    headers: new Headers({ authorization: 'Bearer token-value' }),
    json: async () => ({ routeId: 'route-1' }),
  } as any);

function auditDetails() {
  expect(auditCreateMock).toHaveBeenCalledTimes(1);
  const input = auditCreateMock.mock.calls[0][0];
  return { input, details: JSON.parse(input.details) };
}

describe('send job-assigned email API', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    verifyMock.mockResolvedValue({ sub: 'sub-admin-1', 'cognito:groups': ['administrator'] });
    Object.assign(customOutputs, {
      branchName: 'main',
      smsConfigurationSetName: 'nulldevice-sms-main',
      smsSenderId: 'NullDevice',
    });
    delete process.env.SMS_TEST_NUMBERS;

    routeGetMock.mockResolvedValue({
      data: {
        id: 'route-1',
        routeCode: 'W25-08-114',
        customerId: 'cust-1',
        assignedOperatorSub: 'sub-operator-1',
        assignedOperatorName: 'Jane',
        assignedOperatorEmail: 'jane@nulldevice.dev',
        scheduledDate: '2026-10-07',
      },
      errors: undefined,
    });

    stopListMock.mockResolvedValue({ data: [{ id: 's1' }, { id: 's2' }] });
    customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Beltline Group' }, errors: undefined });
    sesSendMock.mockResolvedValue({ MessageId: 'ses-message-id-1' });
    operatorGetMock.mockResolvedValue({ data: { id: 'sub-operator-1', phone: '0412 345 678' } });
    smsSendMock.mockResolvedValue({ MessageId: 'sms-message-id-1' });
    auditCreateMock.mockResolvedValue({ errors: undefined });
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

  it('paginates through every Stop.list page to count all stops, not just the first page', async () => {
    stopListMock
      .mockResolvedValueOnce({ data: [{ id: 's1' }, { id: 's2' }], nextToken: 'next-page' })
      .mockResolvedValueOnce({ data: [{ id: 's3' }, { id: 's4' }, { id: 's5' }], nextToken: null });

    const request = {
      headers: new Headers({ authorization: 'Bearer token-value' }),
      json: async () => ({ routeId: 'route-1' }),
    } as any;

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(stopListMock).toHaveBeenCalledTimes(2);
    const sentCommand = sesSendMock.mock.calls[0][0];
    const templateData = JSON.parse(sentCommand.input.TemplateData);
    expect(templateData.stopCount).toBe('5');
  });

  it('texts the assigned Operator the Route, Customer, Stop count, date and short link', async () => {
    const response = await notify();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.email).toEqual({ status: 'sent', to: 'jane@nulldevice.dev' });
    expect(body.text).toEqual({ status: 'sent', to: '0412 345 678' });

    expect(operatorGetMock).toHaveBeenCalledWith({ id: 'sub-operator-1' });
    const sms = smsSendMock.mock.calls[0][0].input;
    expect(sms).toEqual({
      DestinationPhoneNumber: '+61412345678',
      OriginationIdentity: 'NullDevice',
      MessageBody: expect.stringMatching(
        /^NullDevice: Route W25-08-114 for Beltline Group, 2 stops, Wed 7 Oct\. https:\/\/.+\/r\/route-1$/
      ),
      MessageType: 'TRANSACTIONAL',
      ConfigurationSetName: 'nulldevice-sms-main',
    });
  });

  it('records the notification against the Route with the channels that went out and a masked mobile', async () => {
    await notify();

    const { input, details } = auditDetails();
    expect(input).toEqual(
      expect.objectContaining({
        operatorId: 'sub-admin-1',
        customerId: 'cust-1',
        resourceType: 'route',
        resourceId: 'route-1',
        action: 'route.notify_operator',
        status: 'success',
      })
    );
    expect(details).toEqual({
      operatorSub: 'sub-operator-1',
      email: { status: 'sent', to: 'jane@nulldevice.dev' },
      text: { status: 'sent', to: '0412 *** 678' },
    });
  });

  it.each([
    ['has no mobile number', { phone: null }, 'Text not sent: the Operator has no mobile number'],
    ['has a number that is not an Australian mobile', { phone: '02 9876 5432' }, "Text not sent: the Operator's mobile number isn't an Australian mobile"],
  ])('emails but skips the text when the Operator %s', async (_label, operator, reason) => {
    operatorGetMock.mockResolvedValue({ data: { id: 'sub-operator-1', ...operator } });

    const response = await notify();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.email.status).toBe('sent');
    expect(body.text).toEqual({ status: 'skipped', reason });
    expect(smsSendMock).not.toHaveBeenCalled();
    expect(auditDetails().details.text).toEqual({ status: 'skipped', reason });
  });

  it('only texts test numbers off production', async () => {
    customOutputs.branchName = 'development';

    const body = await (await notify()).json();
    expect(body.text).toEqual({ status: 'skipped', reason: 'Text not sent: development only texts test numbers' });
    expect(smsSendMock).not.toHaveBeenCalled();
  });

  it('texts a test number off production, whichever way it is written', async () => {
    customOutputs.branchName = 'development';
    process.env.SMS_TEST_NUMBERS = '0400 000 000, +61 412 345 678';

    const body = await (await notify()).json();
    expect(body.text.status).toBe('sent');
    expect(smsSendMock).toHaveBeenCalledTimes(1);
  });

  it('skips the text where texting is not set up', async () => {
    customOutputs.smsConfigurationSetName = undefined;

    const body = await (await notify()).json();
    expect(body.text).toEqual({ status: 'skipped', reason: "Text not sent: texting isn't set up on this site" });
    expect(smsSendMock).not.toHaveBeenCalled();
  });

  it('reports a failed text alongside a sent email', async () => {
    smsSendMock.mockRejectedValue(new Error('Destination phone number not verified'));

    const response = await notify();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.email.status).toBe('sent');
    expect(body.text).toEqual({ status: 'failed', reason: 'Text not sent: Destination phone number not verified' });
  });

  it('still texts when the email fails', async () => {
    sesSendMock.mockRejectedValue(new Error('Template does not exist'));

    const response = await notify();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.email).toEqual({ status: 'failed', reason: 'Email not sent: Template does not exist' });
    expect(body.text.status).toBe('sent');
  });

  it('fails, and records the failure, when nothing went out', async () => {
    sesSendMock.mockRejectedValue(new Error('Template does not exist'));
    operatorGetMock.mockResolvedValue({ data: { id: 'sub-operator-1', phone: null } });

    const response = await notify();
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe(
      'Email not sent: Template does not exist. Text not sent: the Operator has no mobile number.'
    );
    const { input } = auditDetails();
    expect(input.status).toBe('failure');
  });

  it('still reports what was sent when the audit entry cannot be written', async () => {
    auditCreateMock.mockResolvedValue({ errors: [{ message: 'boom' }] });
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await notify();
    expect(response.status).toBe(200);
    expect(consoleError).toHaveBeenCalledWith('Notify Operator audit entry not written:', [{ message: 'boom' }]);
    consoleError.mockRestore();
  });
});
