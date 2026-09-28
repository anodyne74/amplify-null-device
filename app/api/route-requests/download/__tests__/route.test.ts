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

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

const iamClient = {
  models: {
    CustomerUser: {
      list: async ({ filter }: { filter: { userSub: { eq: string } } }) => ({
        data: tables.CustomerUser.filter((row) => row.userSub === filter.userSub.eq),
      }),
    },
    Route: {
      get: async ({ id }: { id: string }) => ({ data: tables.Route.find((row) => row.id === id) ?? null }),
    },
    RouteRequestRecord: {
      get: async ({ id }: { id: string }) => ({ data: tables.RouteRequestRecord.find((row) => row.id === id) ?? null }),
    },
  },
};

jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

jest.mock('@/lib/server/reportStorage', () => ({
  signedRouteRequestFileUrl: async (key: string, filename: string) => `https://signed.example/${key}?name=${filename}`,
}));

import { POST } from '@/app/api/route-requests/download/route';

const OWNER = { sub: 'sub-owner', 'cognito:groups': ['customer'] };
const READ_ONLY = { sub: 'sub-reader', 'cognito:groups': ['customer'] };
const OTHER_OWNER = { sub: 'sub-other', 'cognito:groups': ['customer'] };
const NO_ROW = { sub: 'sub-stranger', 'cognito:groups': ['customer'] };
const ADMIN = { sub: 'sub-admin', 'cognito:groups': ['administrator'] };
const OPERATOR = { sub: 'sub-operator', 'cognito:groups': ['operator'] };

async function call(caller: object | null, body: unknown) {
  verifyMock.mockResolvedValue(caller);
  const headers = new Headers(caller ? { authorization: 'Bearer token-value' } : {});
  const response = await POST({ headers, json: async () => body } as any);
  return { status: response.status as number, body: await response.json() };
}

const ATTACHMENTS = [
  { key: 'requests/req/0-logo.png', filename: 'logo.png', contentType: 'image/png', size: 3000, inline: true },
  { key: 'requests/req/1-run.pdf', filename: 'run.pdf', contentType: 'application/pdf', size: 80000, inline: false },
];

const RUN_PDF = { status: 200, body: { url: 'https://signed.example/requests/req/1-run.pdf?name=run.pdf' } };

describe('POST /api/route-requests/download', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(tables, {
      CustomerUser: [
        { id: 'cu1', userSub: 'sub-owner', customerId: 'c1', role: 'account_owner' },
        { id: 'cu2', userSub: 'sub-reader', customerId: 'c1', role: 'read_only' },
        { id: 'cu3', userSub: 'sub-other', customerId: 'c2', role: 'account_owner' },
      ],
      Route: [{ id: 'r1', customerId: 'c1' }],
      RouteRequestRecord: [
        { id: 'req', status: 'linked', routeId: 'r1', attachments: ATTACHMENTS },
        { id: 'dismissed', status: 'dismissed', routeId: null, attachments: ATTACHMENTS },
      ],
    });
  });

  it('gives an Account Owner and a read-only user of the Customer a short-lived link to an attachment', async () => {
    for (const caller of [OWNER, READ_ONLY]) {
      expect(await call(caller, { requestId: 'req', attachment: 1 })).toEqual(RUN_PDF);
    }
  });

  it('gives staff the same link', async () => {
    for (const staff of [ADMIN, OPERATOR]) {
      expect(await call(staff, { requestId: 'req', attachment: 1 })).toEqual(RUN_PDF);
    }
  });

  it('refuses a Customer User of another Customer', async () => {
    const result = await call(OTHER_OWNER, { requestId: 'req', attachment: 1 });
    expect(result.status).toBe(403);
    expect(result.body.url).toBeUndefined();
  });

  it("refuses a customer a record that isn't linked, or doesn't exist", async () => {
    for (const requestId of ['dismissed', 'nope']) {
      expect((await call(OWNER, { requestId, attachment: 1 })).status).toBe(403);
    }
  });

  it('refuses a customer-group user with no Customer, and no session', async () => {
    expect((await call(NO_ROW, { requestId: 'req', attachment: 1 })).status).toBe(403);
    expect((await call(null, { requestId: 'req', attachment: 1 })).status).toBe(401);
  });

  it('does not hand out a hidden inline image, or an attachment that is not there', async () => {
    expect((await call(OWNER, { requestId: 'req', attachment: 0 })).status).toBe(404);
    expect((await call(OWNER, { requestId: 'req', attachment: 7 })).status).toBe(404);
  });

  it('tells staff an unlinked record has no file to download', async () => {
    expect((await call(ADMIN, { requestId: 'dismissed', attachment: 1 })).status).toBe(404);
  });

  it('requires a record and an attachment position', async () => {
    expect((await call(OWNER, { requestId: 'req' })).status).toBe(400);
    expect((await call(OWNER, { attachment: 1 })).status).toBe(400);
  });
});
