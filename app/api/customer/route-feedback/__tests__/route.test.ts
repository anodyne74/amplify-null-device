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
const routeGetMock = jest.fn();
const routeUpdateMock = jest.fn();
const invoiceListMock = jest.fn();
const customerGetMock = jest.fn();
const auditLogCreateMock = jest.fn();
const sesSendMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: jest.fn(() => ({ verify: verifyMock })) },
}));

// Mocked wholesale so tests never load the IAM credential provider (ESM-only).
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => ({
    models: {
      CustomerUser: { list: customerUserListMock },
      Route: { get: routeGetMock, update: routeUpdateMock },
      Invoice: { list: invoiceListMock },
      Customer: { get: customerGetMock },
      AuditLog: { create: auditLogCreateMock },
    },
  }),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: (...args: unknown[]) => sesSendMock(...args) })),
  SendEmailCommand: jest.fn((input: unknown) => ({ input })),
}));

import { POST } from '@/app/api/customer/route-feedback/route';
import { POST as STATUS } from '@/app/api/customer/route-feedback/status/route';

function makeRequest(body: Record<string, unknown>) {
  return { headers: new Headers({ authorization: 'Bearer token-value' }), json: async () => body } as never;
}

const completedRoute = {
  id: 'route-1',
  routeCode: 'W40-26-003',
  customerId: 'cust-1',
  status: 'completed',
  viewerSubs: ['sub-ann'],
};

function auditActions() {
  return auditLogCreateMock.mock.calls.map(([entry]) => ({ action: entry.action, details: JSON.parse(entry.details ?? '{}') }));
}

describe('customer route-feedback API (#467)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'sub-ann', 'cognito:groups': ['customer'] });
    customerUserListMock.mockResolvedValue({
      data: [{ customerId: 'cust-1', role: 'read_only', userSub: 'sub-ann', name: 'Ann Agent', email: 'ann@agency.test' }],
    });
    routeGetMock.mockResolvedValue({ data: completedRoute });
    routeUpdateMock.mockResolvedValue({ data: { id: 'route-1' }, errors: undefined });
    invoiceListMock.mockResolvedValue({ data: [] });
    customerGetMock.mockResolvedValue({ data: { id: 'cust-1', name: 'Harcourts Epping' } });
    auditLogCreateMock.mockResolvedValue({ errors: undefined });
    sesSendMock.mockResolvedValue({ MessageId: 'm-1' });
  });

  it('saves All good, audits it, and emails no one', async () => {
    const res = await POST(makeRequest({ routeId: 'route-1', tone: 'good' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, emailed: false });
    expect(routeUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'route-1',
        customerFeedbackTone: 'good',
        customerFeedbackNote: '',
        customerFeedbackBy: 'sub-ann',
        customerFeedbackByName: 'Ann Agent',
      })
    );
    expect(auditActions()).toEqual([{ action: 'route.customer_feedback', details: { tone: 'good', changed: false } }]);
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it('emails admin@ when something was off, without putting the note in the audit trail', async () => {
    const res = await POST(makeRequest({ routeId: 'route-1', tone: 'issue', note: 'Two signs faced the wrong way.' }));

    expect(await res.json()).toEqual({ success: true, emailed: true });
    const sent = sesSendMock.mock.calls[0][0].input;
    expect(sent.Destination.ToAddresses).toEqual([expect.stringMatching(/^admin@/)]);
    expect(sent.Message.Subject.Data).toBe('Route W40-26-003: Harcourts Epping says something was off');
    expect(sent.Message.Body.Text.Data).toContain('Two signs faced the wrong way.');
    expect(JSON.stringify(auditActions())).not.toContain('wrong way');
  });

  it('keeps the feedback when the email fails', async () => {
    sesSendMock.mockRejectedValue(new Error('SES is down'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await POST(makeRequest({ routeId: 'route-1', tone: 'issue', note: 'Missing sign' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, emailed: false });
    expect(routeUpdateMock).toHaveBeenCalled();
  });

  it.each([
    ['a Route the caller is not a viewer of', () => routeGetMock.mockResolvedValue({ data: { ...completedRoute, viewerSubs: ['sub-ben'] } }), 404],
    ["another Customer's Route", () => routeGetMock.mockResolvedValue({ data: { ...completedRoute, customerId: 'cust-2' } }), 404],
    ['a Route that is not completed', () => routeGetMock.mockResolvedValue({ data: { ...completedRoute, status: 'in_progress' } }), 409],
    ['an invoiced Route', () => invoiceListMock.mockResolvedValue({ data: [{ id: 'inv-1', routeId: 'route-1' }] }), 409],
  ])('refuses %s, and writes nothing', async (_case, arrange, status) => {
    arrange();

    const res = await POST(makeRequest({ routeId: 'route-1', tone: 'good' }));

    expect(res.status).toBe(status);
    expect(routeUpdateMock).not.toHaveBeenCalled();
    expect(auditLogCreateMock).not.toHaveBeenCalled();
    expect(sesSendMock).not.toHaveBeenCalled();
  });

  it('refuses Something was off with no note', async () => {
    const res = await POST(makeRequest({ routeId: 'route-1', tone: 'issue', note: '  ' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Say what was off.' });
    expect(routeUpdateMock).not.toHaveBeenCalled();
  });

  it('refuses a caller who is not signed in as a customer user', async () => {
    verifyMock.mockRejectedValue(new Error('bad token'));

    const res = await POST(makeRequest({ routeId: 'route-1', tone: 'good' }));

    expect([401, 403]).toContain(res.status);
    expect(routeUpdateMock).not.toHaveBeenCalled();
  });

  describe('status', () => {
    it('says the card is open on a completed, uninvoiced Route', async () => {
      const res = await STATUS(makeRequest({ routeId: 'route-1' }));
      expect(await res.json()).toEqual({ locked: null });
    });

    it('says why it is locked once the Route is invoiced', async () => {
      invoiceListMock.mockResolvedValue({ data: [{ id: 'inv-1', routeId: 'route-1' }] });
      const res = await STATUS(makeRequest({ routeId: 'route-1' }));
      expect(await res.json()).toEqual({ locked: 'This route has been invoiced, so its feedback can no longer be changed.' });
    });

    it('hides a Route the caller cannot see', async () => {
      routeGetMock.mockResolvedValue({ data: { ...completedRoute, viewerSubs: [] } });
      const res = await STATUS(makeRequest({ routeId: 'route-1' }));
      expect(res.status).toBe(404);
    });
  });
});
