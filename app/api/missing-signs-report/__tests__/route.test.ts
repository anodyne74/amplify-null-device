jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, json: async () => body }),
  },
}));

const verifyMock = jest.fn();
const routeGetMock = jest.fn();
const routeUpdateMock = jest.fn();
const stopListMock = jest.fn();
const customerGetMock = jest.fn();
const customerUserListMock = jest.fn();
const auditLogCreateMock = jest.fn();
const sesSendMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: jest.fn(() => ({ verify: verifyMock })) },
}));

// Mocked wholesale so tests never load the IAM credential provider (ESM-only).
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => ({
    models: {
      Route: { get: routeGetMock, update: routeUpdateMock },
      Stop: { list: stopListMock },
      Customer: { get: customerGetMock },
      CustomerUser: { list: customerUserListMock },
      AuditLog: { create: auditLogCreateMock },
    },
  }),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: (...args: unknown[]) => sesSendMock(...args) })),
  SendTemplatedEmailCommand: jest.fn((input: unknown) => ({ input })),
}));

jest.mock('@/lib/amplifyOutputsCustom', () => ({
  customOutputs: { sesMissingSignsReportTemplateName: 'NullDeviceMissingSignsReportTemplate-development' },
}));

import { POST } from '@/app/api/missing-signs-report/route';

function makeRequest(body: Record<string, unknown>) {
  return { headers: new Headers({ authorization: 'Bearer token-value' }), json: async () => body } as never;
}

const finalisedRoute = {
  id: 'route-1',
  routeCode: 'W40-26-003',
  customerId: 'cust-1',
  status: 'completed',
  scheduledDate: '2026-10-06',
  pickupDate: '2026-10-10',
  missingSignsReportSentAt: null,
};

function audits() {
  return auditLogCreateMock.mock.calls.map(([entry]) => ({ action: entry.action, status: entry.status, details: JSON.parse(entry.details ?? '{}') }));
}

describe('missing-signs-report API (#468)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'operator-sub', 'cognito:groups': ['operator'] });
    routeGetMock.mockResolvedValue({ data: finalisedRoute });
    routeUpdateMock.mockResolvedValue({ data: { id: 'route-1' }, errors: undefined });
    stopListMock.mockResolvedValue({
      data: [
        { address: '44 Eastcote Road, North Epping', missingSignsCount: 1 },
        { address: '9 Grayson Rd, North Epping', missingSignsCount: 0 },
      ],
    });
    customerGetMock.mockResolvedValue({
      data: {
        id: 'cust-1',
        name: 'Harcourts Epping',
        email: 'office@agency.test',
        missingSignsReportEnabled: true,
        sendMissingSignsReport: true,
        billingCcEmails: ['accounts@agency.test'],
      },
    });
    customerUserListMock.mockResolvedValue({ data: [{ role: 'account_owner', email: 'owner@agency.test' }] });
    auditLogCreateMock.mockResolvedValue({ errors: undefined });
    sesSendMock.mockResolvedValue({ MessageId: 'm-1' });
  });

  it('emails the Billing email, copying the billing CCs and admin, then stamps the Route and audits it (#504)', async () => {
    const res = await POST(makeRequest({ routeId: 'route-1' }));

    expect(await res.json()).toEqual({ outcome: 'sent' });
    const sent = sesSendMock.mock.calls[0][0].input;
    // The Account Owner (owner@) isn't the Billing email or a CC, so isn't sent it.
    expect(sent.Destination.ToAddresses).toEqual(['office@agency.test']);
    expect(sent.Destination.CcAddresses).toEqual(['accounts@agency.test', expect.stringMatching(/^admin@/)]);
    expect(sent.Template).toBe('NullDeviceMissingSignsReportTemplate-development');
    expect(JSON.parse(sent.TemplateData)).toEqual({
      customerName: 'Harcourts Epping',
      routeCode: 'W40-26-003',
      placedDate: 'Oct 6, 2026',
      collectedDate: 'Oct 10, 2026',
      properties: [{ address: '44 Eastcote Road, North Epping', missingLabel: '1 sign' }],
      totalLabel: '1 sign',
      logoUrl: expect.stringMatching(/^https:\/\/.+\/logo\.svg$/),
      year: String(new Date().getFullYear()),
    });
    expect(routeUpdateMock).toHaveBeenCalledWith({ id: 'route-1', missingSignsReportSentAt: expect.any(String) });
    expect(audits()).toEqual([
      { action: 'route.missingSignsReport.send', status: 'success', details: { outcome: 'sent', recipients: 3 } },
    ]);
    expect(JSON.stringify(audits())).not.toContain('@');
  });

  it('goes to admin alone when the Customer has no address (#504)', async () => {
    customerGetMock.mockResolvedValue({
      data: { id: 'cust-1', name: 'Harcourts Epping', email: null, billingCcEmails: [], missingSignsReportEnabled: true },
    });

    const res = await POST(makeRequest({ routeId: 'route-1' }));

    expect(await res.json()).toEqual({ outcome: 'sent' });
    const sent = sesSendMock.mock.calls[0][0].input;
    expect(sent.Destination.ToAddresses).toEqual([expect.stringMatching(/^admin@/)]);
    expect(sent.Destination.CcAddresses).toEqual([]);
  });

  it.each([
    ['reports are not switched on', () => customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'H', email: 'o@a.test', missingSignsReportEnabled: false } }), 'reports not switched on for this customer'],
    ['the Customer turned them off', () => customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'H', email: 'o@a.test', missingSignsReportEnabled: true, sendMissingSignsReport: false } }), 'customer has turned reports off'],
    ['no signs are missing', () => stopListMock.mockResolvedValue({ data: [{ address: '9 Grayson Rd', missingSignsCount: 0 }] }), 'no missing signs'],
  ])('sends nothing when %s, and records why', async (_case, arrange, reason) => {
    arrange();

    const res = await POST(makeRequest({ routeId: 'route-1' }));

    expect(await res.json()).toEqual({ outcome: 'skipped', reason });
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(routeUpdateMock).not.toHaveBeenCalled();
    expect(audits()).toEqual([{ action: 'route.missingSignsReport.send', status: 'success', details: { outcome: 'skipped', reason } }]);
  });

  it('sends nothing, and writes nothing, when it was already sent', async () => {
    routeGetMock.mockResolvedValue({ data: { ...finalisedRoute, missingSignsReportSentAt: '2026-10-05T01:00:00.000Z' } });

    const res = await POST(makeRequest({ routeId: 'route-1' }));

    expect(await res.json()).toEqual({ outcome: 'skipped', reason: 'already sent' });
    expect(sesSendMock).not.toHaveBeenCalled();
    expect(routeUpdateMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
  });

  it('leaves the Route unstamped, so it can be tried again, when the email fails', async () => {
    sesSendMock.mockRejectedValue(new Error('SES is down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeRequest({ routeId: 'route-1' }));

    expect(await res.json()).toEqual({ outcome: 'failed' });
    expect(routeUpdateMock).not.toHaveBeenCalled();
    expect(audits()).toEqual([{ action: 'route.missingSignsReport.send', status: 'failure', details: { outcome: 'failed', recipients: 3 } }]);
  });

  it('refuses a customer user', async () => {
    verifyMock.mockResolvedValue({ sub: 'cust-sub', 'cognito:groups': ['customer'] });

    const res = await POST(makeRequest({ routeId: 'route-1' }));

    expect(res.status).toBe(403);
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it('says so for a Route that does not exist', async () => {
    routeGetMock.mockResolvedValue({ data: null });

    const res = await POST(makeRequest({ routeId: 'missing' }));

    expect(res.status).toBe(404);
  });
});
