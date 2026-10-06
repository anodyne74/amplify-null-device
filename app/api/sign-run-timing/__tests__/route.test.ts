/**
 * @jest-environment node
 */
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

jest.mock('@/lib/amplifyOutputsCustom', () => ({
  customOutputs: { branchName: 'development' },
}));

import { POST } from '@/app/api/sign-run-timing/route';

const ADMIN = { sub: 'sub-admin', 'cognito:groups': ['administrator'] };
const OPERATOR = { sub: 'sub-operator', 'cognito:groups': ['operator'] };
const CUSTOMER = { sub: 'sub-owner', 'cognito:groups': ['customer'] };

const RECORD = {
  kind: 'startPlacement',
  routeId: 'r1',
  authCheckMs: 18042,
  mutationMs: 210,
  confirmToSavedMs: 18252,
  retries: 0,
  outcome: 'saved',
};

async function call(caller: object | null, body: unknown) {
  verifyMock.mockResolvedValue(caller);
  const headers = new Headers(caller ? { authorization: 'Bearer token-value' } : {});
  const response = await POST({ headers, json: async () => body } as any);
  return { status: response.status as number, body: await response.json() };
}

describe('POST /api/sign-run-timing', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it.each([
    ['an operator', OPERATOR],
    ['an administrator', ADMIN],
  ])('logs the record as one JSON line for %s', async (_label, caller) => {
    const result = await call(caller, RECORD);

    expect(result.status).toBe(200);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toEqual({
      event: 'sign-run-timing',
      branch: 'development',
      callerSub: caller.sub,
      ...RECORD,
    });
  });

  it('logs a stop settlement', async () => {
    const result = await call(OPERATOR, { ...RECORD, kind: 'pickupStopCouldntCollect', outcome: 'failed' });

    expect(result.status).toBe(200);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toMatchObject({ kind: 'pickupStopCouldntCollect', outcome: 'failed' });
  });

  it('logs a write the operator discarded unsaved (#355)', async () => {
    const result = await call(OPERATOR, { ...RECORD, retries: 4, outcome: 'discarded' });

    expect(result.status).toBe(200);
    expect(JSON.parse(logSpy.mock.calls[0][0])).toMatchObject({ retries: 4, outcome: 'discarded' });
  });

  it('refuses a caller who is not signed in', async () => {
    const result = await call(null, RECORD);

    expect(result.status).toBe(401);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('refuses a customer', async () => {
    const result = await call(CUSTOMER, RECORD);

    expect(result.status).toBe(403);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['no body', null],
    ['an unknown kind', { ...RECORD, kind: 'teleport' }],
    ['a missing routeId', { ...RECORD, routeId: undefined }],
    ['a blank routeId', { ...RECORD, routeId: '  ' }],
    ['an unknown outcome', { ...RECORD, outcome: 'maybe' }],
    ['a negative duration', { ...RECORD, mutationMs: -1 }],
    ['a fractional duration', { ...RECORD, authCheckMs: 1.5 }],
    ['a string duration', { ...RECORD, confirmToSavedMs: '100' }],
    ['a missing retries count', { ...RECORD, retries: undefined }],
  ])('rejects %s', async (_label, body) => {
    const result = await call(OPERATOR, body);

    expect(result.status).toBe(400);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs only the record fields, not extra ones sent with it', async () => {
    await call(OPERATOR, { ...RECORD, branch: 'main', event: 'other', note: 'x' });

    const line = JSON.parse(logSpy.mock.calls[0][0]);
    expect(line.branch).toBe('development');
    expect(line.event).toBe('sign-run-timing');
    expect(line).not.toHaveProperty('note');
  });
});
