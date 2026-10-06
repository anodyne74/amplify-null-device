jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
const settingGetMock = jest.fn();
const settingCreateMock = jest.fn();
const settingUpdateMock = jest.fn();
const settingDeleteMock = jest.fn();
const auditCreateMock = jest.fn();
const iamClient = {
  models: {
    FeatureFlagSetting: {
      get: settingGetMock,
      create: settingCreateMock,
      update: settingUpdateMock,
      delete: settingDeleteMock,
    },
    AuditLog: { create: auditCreateMock },
  },
};

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

// Mocked wholesale so tests never import @aws-sdk/credential-provider-node
// (ESM-only, which jest's CJS transform can't load).
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

// The registry ships empty (#297); register a test-only flag.
jest.mock('@/lib/featureFlags', () => {
  const actual = jest.requireActual('@/lib/featureFlags');
  return {
    ...actual,
    FEATURE_FLAG_NAMES: ['alpha'],
    isFeatureFlagName: (name: unknown) => actual.isFeatureFlagName(name, ['alpha']),
  };
});

import { POST } from '@/app/api/admin/feature-flags/route';

function makeRequest(body: Record<string, unknown>) {
  return { headers: new Headers({ authorization: 'Bearer token-value' }), json: async () => body } as any;
}

function auditEntries() {
  return auditCreateMock.mock.calls.map(([input]) => ({ ...input, details: JSON.parse(input.details) }));
}

describe('admin feature-flags API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyMock.mockResolvedValue({ sub: 'sub-admin', 'cognito:groups': ['administrator'] });
    settingGetMock.mockResolvedValue({ data: { id: 'alpha', state: 'selected', selectedCustomerIds: ['c1', 'c2'] } });
    settingCreateMock.mockImplementation(async (input) => ({ data: input }));
    settingUpdateMock.mockImplementation(async (input) => ({ data: input }));
    settingDeleteMock.mockResolvedValue({ data: {} });
    auditCreateMock.mockResolvedValue({ data: { id: 'audit-1' } });
  });

  it('returns 401 when the token is missing', async () => {
    const response = await POST({ headers: new Headers(), json: async () => ({}) } as any);
    expect(response.status).toBe(401);
  });

  it.each([['customer'], ['operator']])('returns 403 for a %s', async (group) => {
    verifyMock.mockResolvedValue({ sub: 'sub-x', 'cognito:groups': [group] });
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'off' }));
    expect(response.status).toBe(403);
    expect(settingUpdateMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a flag that is not registered', async () => {
    const response = await POST(makeRequest({ name: 'retired', action: 'set-state', state: 'off' }));
    expect(response.status).toBe(400);
    expect(settingGetMock).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: 'alpha', action: 'set-state', state: 'sometimes' }],
    [{ name: 'alpha', action: 'set-customers', customerIds: 'c1' }],
    [{ name: 'alpha', action: 'set-customers', customerIds: ['c1', 7] }],
    [{ name: 'alpha', action: 'delete' }],
  ])('returns 400 for a malformed change %j', async (body) => {
    const response = await POST(makeRequest(body));
    expect(response.status).toBe(400);
    expect(settingGetMock).not.toHaveBeenCalled();
  });

  it('switches Off keeping the list, and writes exactly one audit entry', async () => {
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'off' }));
    expect(response.status).toBe(200);
    expect(settingUpdateMock).toHaveBeenCalledWith({
      id: 'alpha',
      state: 'off',
      selectedCustomerIds: ['c1', 'c2'],
      everyoneSince: null,
      updatedBy: 'sub-admin',
    });
    expect(auditEntries()).toEqual([
      expect.objectContaining({
        operatorId: 'sub-admin',
        eventType: 'data_modification',
        resourceType: 'feature_flag',
        resourceId: 'alpha',
        status: 'success',
        timestamp: expect.any(String),
        details: { flag: 'alpha', oldState: 'selected', newState: 'off', affectedCustomerIds: ['c1', 'c2'] },
      }),
    ]);
  });

  it('creates the setting the first time a flag is changed', async () => {
    settingGetMock.mockResolvedValue({ data: null });
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'everyone' }));
    expect(response.status).toBe(200);
    expect(settingCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'alpha', state: 'everyone', everyoneSince: expect.any(String) })
    );
    expect(settingUpdateMock).not.toHaveBeenCalled();
    expect(auditEntries()[0].details).toEqual({
      flag: 'alpha',
      oldState: 'off',
      newState: 'everyone',
      affectedCustomers: 'all',
    });
  });

  it('audits the Customers added and removed by a list change', async () => {
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-customers', customerIds: ['c2', 'c3'] }));
    expect(response.status).toBe(200);
    expect(settingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ selectedCustomerIds: ['c2', 'c3'] }));
    expect(auditEntries()).toHaveLength(1);
    expect(auditEntries()[0].details).toEqual(
      expect.objectContaining({ addedCustomerIds: ['c3'], removedCustomerIds: ['c1'] })
    );
  });

  it('clears the list as a separate action', async () => {
    const response = await POST(makeRequest({ name: 'alpha', action: 'clear-customers' }));
    expect(response.status).toBe(200);
    expect(settingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ state: 'selected', selectedCustomerIds: [] }));
    expect(auditEntries()[0].details).toEqual(expect.objectContaining({ removedCustomerIds: ['c1', 'c2'] }));
  });

  it('writes and audits nothing for a change that changes nothing', async () => {
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'selected' }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({ changed: false }));
    expect(settingUpdateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('returns 500 and writes nothing when the current setting cannot be read', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    settingGetMock.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'off' }));
    expect(response.status).toBe(500);
    expect(settingUpdateMock).not.toHaveBeenCalled();
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('returns 500 without auditing when the setting write fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    settingUpdateMock.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'off' }));
    expect(response.status).toBe(500);
    expect(auditCreateMock).not.toHaveBeenCalled();
  });

  it('puts the setting back when the audit entry cannot be written', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    auditCreateMock.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'off' }));
    expect(response.status).toBe(500);
    expect(settingUpdateMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'alpha', state: 'selected', selectedCustomerIds: ['c1', 'c2'] })
    );
  });

  it('deletes a newly created setting when the audit entry cannot be written', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    settingGetMock.mockResolvedValue({ data: null });
    auditCreateMock.mockResolvedValue({ data: null, errors: [{ message: 'boom' }] });
    const response = await POST(makeRequest({ name: 'alpha', action: 'set-state', state: 'everyone' }));
    expect(response.status).toBe(500);
    expect(settingDeleteMock).toHaveBeenCalledWith({ id: 'alpha' });
  });
});
