jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
const operatorGetMock = jest.fn();
const consentGetMock = jest.fn();
const consentCreateMock = jest.fn();
const consentUpdateMock = jest.fn();
const consentDeleteMock = jest.fn();
const auditCreateMock = jest.fn();
const iamClient = {
  models: {
    Operator: { get: operatorGetMock },
    OperatorTextConsent: { get: consentGetMock, create: consentCreateMock, update: consentUpdateMock, delete: consentDeleteMock },
    AuditLog: { create: auditCreateMock },
  },
};

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: { create: jest.fn(() => ({ verify: verifyMock })) },
}));
jest.mock('@/lib/server/iamDataClient', () => ({ getIamDataClient: () => iamClient }));

import { POST } from '@/app/api/operator/text-consent/route';

function makeRequest(body: Record<string, unknown>, token = 'Bearer token-value') {
  return { headers: new Headers(token ? { authorization: token } : {}), json: async () => body } as any;
}
const auditEntries = () => auditCreateMock.mock.calls.map(([input]) => ({ ...input, details: JSON.parse(input.details) }));

describe('operator text-consent API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'op-1', 'cognito:groups': ['operator'] });
    operatorGetMock.mockResolvedValue({ data: { id: 'op-1', phone: '+61412345678' } });
    consentGetMock.mockResolvedValue({ data: null });
    consentCreateMock.mockResolvedValue({ data: { id: 'op-1' } });
    consentUpdateMock.mockResolvedValue({ data: { id: 'op-1' } });
    consentDeleteMock.mockResolvedValue({ errors: undefined });
    auditCreateMock.mockResolvedValue({ errors: undefined });
  });

  it('401s without a token', async () => {
    const res = await POST(makeRequest({ consent: 'yes' }, ''));
    expect(res.status).toBe(401);
  });

  it('403s for a customer', async () => {
    verifyMock.mockResolvedValue({ sub: 'cust-1', 'cognito:groups': ['customer'] });
    const res = await POST(makeRequest({ consent: 'yes' }));
    expect(res.status).toBe(403);
    expect(consentCreateMock).not.toHaveBeenCalled();
  });

  it('400s for an answer that is not yes or no', async () => {
    const res = await POST(makeRequest({ consent: 'maybe' }));
    expect(res.status).toBe(400);
  });

  it('records an Operator\'s own yes and audits it with them as the actor', async () => {
    const res = await POST(makeRequest({ consent: 'yes' }));
    expect(res.status).toBe(200);
    expect(consentCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      id: 'op-1', operatorSub: 'op-1', textConsent: 'yes', textConsentMobile: '+61412345678',
    }));
    const [entry] = auditEntries();
    expect(entry).toMatchObject({
      operatorId: 'op-1', resourceType: 'operator', resourceId: 'op-1', action: 'operator.text_consent_changed', status: 'success',
      details: { previous: 'unset', next: 'yes', by: 'operator' },
    });
    expect(JSON.stringify(entry)).not.toContain('0412');
  });

  it('updates an existing row rather than creating another', async () => {
    consentGetMock.mockResolvedValue({ data: { id: 'op-1', textConsent: 'yes', textConsentMobile: '+61412345678' } });
    await POST(makeRequest({ consent: 'no' }));
    expect(consentUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'op-1', textConsent: 'no' }));
    expect(consentCreateMock).not.toHaveBeenCalled();
    expect(auditEntries()[0].details).toMatchObject({ previous: 'yes', next: 'no' });
  });

  it('refuses an Operator changing someone else\'s', async () => {
    const res = await POST(makeRequest({ operatorId: 'op-2', consent: 'no' }));
    expect(res.status).toBe(403);
    expect(consentCreateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  describe('as an administrator', () => {
    beforeEach(() => verifyMock.mockResolvedValue({ sub: 'admin-1', 'cognito:groups': ['administrator'] }));

    it('turns it on only with the Operator having agreed, and audits the administrator', async () => {
      const refused = await POST(makeRequest({ operatorId: 'op-1', consent: 'yes' }));
      expect(refused.status).toBe(400);

      const res = await POST(makeRequest({ operatorId: 'op-1', consent: 'yes', operatorAgreed: true }));
      expect(res.status).toBe(200);
      expect(auditEntries()[0]).toMatchObject({
        operatorId: 'admin-1', resourceId: 'op-1', details: { by: 'administrator', operatorAgreed: true },
      });
    });

    it('turns it off without a confirmation', async () => {
      const res = await POST(makeRequest({ operatorId: 'op-1', consent: 'no' }));
      expect(res.status).toBe(200);
    });

    it('404s for an Operator who does not exist', async () => {
      operatorGetMock.mockResolvedValue({ data: null });
      const res = await POST(makeRequest({ operatorId: 'nobody', consent: 'no' }));
      expect(res.status).toBe(404);
    });
  });

  it('puts the answer back when the audit entry cannot be written', async () => {
    consentGetMock.mockResolvedValue({ data: { id: 'op-1', operatorSub: 'op-1', textConsent: 'no', textConsentAt: 't0', textConsentMobile: '+61412345678' } });
    auditCreateMock.mockResolvedValue({ errors: [{ message: 'boom' }] });
    const res = await POST(makeRequest({ consent: 'yes' }));
    expect(res.status).toBe(500);
    expect(consentUpdateMock).toHaveBeenLastCalledWith({ id: 'op-1', textConsent: 'no', textConsentAt: 't0', textConsentMobile: '+61412345678' });
  });

  it('removes the new row when its audit entry cannot be written', async () => {
    auditCreateMock.mockResolvedValue({ errors: [{ message: 'boom' }] });
    const res = await POST(makeRequest({ consent: 'yes' }));
    expect(res.status).toBe(500);
    expect(consentDeleteMock).toHaveBeenCalledWith({ id: 'op-1' });
  });
});
