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

jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => ({ models: {} }),
}));

const askMock = jest.fn();
jest.mock('@/lib/server/scheduleModel', () => ({
  askScheduleModel: (...args: unknown[]) => askMock(...args),
}));

import { POST } from '@/app/api/route-requests/schedule-model-check/route';

const ADMIN = { sub: 'sub-admin', 'cognito:groups': ['administrator'] };
const OPERATOR = { sub: 'sub-operator', 'cognito:groups': ['operator'] };
const CUSTOMER = { sub: 'sub-owner', 'cognito:groups': ['customer'] };

async function call(caller: object | null) {
  verifyMock.mockResolvedValue(caller);
  const headers = new Headers(caller ? { authorization: 'Bearer token-value' } : {});
  const response = await POST({ headers } as any);
  return { status: response.status as number, body: await response.json() };
}

describe('POST /api/route-requests/schedule-model-check', () => {
  beforeEach(() => {
    askMock.mockReset();
    process.env.BEDROCK_SCHEDULE_MODEL_ID = 'test-model';
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    delete process.env.BEDROCK_SCHEDULE_MODEL_ID;
  });

  it("tells an administrator the model answered, and which model it was", async () => {
    askMock.mockResolvedValue(' OK\n');
    expect(await call(ADMIN)).toEqual({ status: 200, body: { ok: true, answer: 'OK', modelId: 'test-model' } });
  });

  it('names the kind of failure without leaking its message', async () => {
    const denied = Object.assign(new Error('arn:aws:iam::123 is not authorized'), { name: 'AccessDeniedException' });
    askMock.mockRejectedValue(denied);
    const { status, body } = await call(ADMIN);
    expect(status).toBe(502);
    expect(body).toEqual({ ok: false, error: 'The Schedule model did not answer (AccessDeniedException)' });
  });

  it('refuses operators and customers without calling the model', async () => {
    expect((await call(OPERATOR)).status).toBe(403);
    expect((await call(CUSTOMER)).status).toBe(403);
    expect(askMock).not.toHaveBeenCalled();
  });

  it('refuses a request with no session', async () => {
    expect((await call(null)).status).toBe(401);
    expect(askMock).not.toHaveBeenCalled();
  });
});
