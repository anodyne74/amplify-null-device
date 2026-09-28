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

const requests: Record<string, unknown>[] = [];

const iamClient = {
  models: {
    RouteRequestEmail: {
      get: async ({ id }: { id: string }) => ({ data: requests.find((row) => row.id === id) ?? null }),
    },
  },
};

jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

jest.mock('@/lib/server/reportStorage', () => ({
  signedRouteRequestFileUrl: async (key: string, filename: string) => `https://signed.example/${key}?as=${filename}`,
  signedRawMessageUrl: async (key: string) => `https://inbound.example/${key}`,
}));

import { POST } from '@/app/api/route-requests/file/route';

const ADMIN = { sub: 'sub-admin', 'cognito:groups': ['administrator'] };
const OPERATOR = { sub: 'sub-operator', 'cognito:groups': ['operator'] };
const CUSTOMER = { sub: 'sub-owner', 'cognito:groups': ['customer'] };

async function call(caller: object | null, body: unknown) {
  verifyMock.mockResolvedValue(caller);
  const headers = new Headers(caller ? { authorization: 'Bearer token-value' } : {});
  const response = await POST({ headers, json: async () => body } as any);
  return { status: response.status as number, body: await response.json() };
}

describe('POST /api/route-requests/file', () => {
  beforeEach(() => {
    requests.splice(0, requests.length, {
      id: 'ses-msg-1',
      rawMessageKey: 'ses-msg-1',
      attachments: [
        { key: 'requests/ses-msg-1/0-logo.png', filename: 'logo.png' },
        { key: 'requests/ses-msg-1/1-schedule.pdf', filename: 'schedule.pdf' },
      ],
    });
  });

  it("gives an administrator a short-lived link to one of a Route Request's attachments", async () => {
    expect(await call(ADMIN, { requestId: 'ses-msg-1', file: 1 })).toEqual({
      status: 200,
      body: { url: 'https://signed.example/requests/ses-msg-1/1-schedule.pdf?as=schedule.pdf' },
    });
  });

  it('gives an administrator a short-lived link to the raw message', async () => {
    expect(await call(ADMIN, { requestId: 'ses-msg-1', file: 'raw' })).toEqual({
      status: 200,
      body: { url: 'https://inbound.example/ses-msg-1' },
    });
  });

  it('reports a missing Route Request or attachment as not found', async () => {
    expect((await call(ADMIN, { requestId: 'nope', file: 0 })).status).toBe(404);
    expect((await call(ADMIN, { requestId: 'ses-msg-1', file: 2 })).status).toBe(404);
  });

  it('refuses customers and operators', async () => {
    expect((await call(CUSTOMER, { requestId: 'ses-msg-1', file: 0 })).status).toBe(403);
    expect((await call(OPERATOR, { requestId: 'ses-msg-1', file: 0 })).status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    expect((await call(null, { requestId: 'ses-msg-1', file: 0 })).status).toBe(401);
  });

  it('requires a Route Request id and which file', async () => {
    expect((await call(ADMIN, { file: 0 })).status).toBe(400);
    expect((await call(ADMIN, { requestId: 'ses-msg-1' })).status).toBe(400);
    expect((await call(ADMIN, { requestId: 'ses-msg-1', file: -1 })).status).toBe(400);
  });
});
