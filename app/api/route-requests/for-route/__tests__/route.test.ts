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
      listRouteRequestRecordsByRoute: async ({ routeId }: { routeId: string }) => ({
        data: tables.RouteRequestRecord.filter((row) => row.routeId === routeId),
      }),
    },
  },
};

jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

import { POST } from '@/app/api/route-requests/for-route/route';

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

const RECORD = {
  source: 'email',
  status: 'linked',
  routeId: 'r1',
  fromName: 'Ann Agent',
  fromAddress: 'ann@agency.test',
  subject: 'Tuesday',
  spfVerdict: 'FAIL',
  rawMessageKey: 'inbound/raw',
  attachments: [],
};

describe('POST /api/route-requests/for-route', () => {
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
        { ...RECORD, id: 'amd', role: 'amendment', sentAt: '2026-09-28T00:00:00.000Z' },
        { ...RECORD, id: 'req', role: 'request', sentAt: '2026-09-27T00:00:00.000Z' },
        { ...RECORD, id: 'gone', role: 'amendment', status: 'dismissed', sentAt: '2026-09-27T12:00:00.000Z' },
      ],
    });
  });

  it("gives an Account Owner and a read-only user of the Customer the Route's requests, in order, in the customer shape", async () => {
    for (const caller of [OWNER, READ_ONLY]) {
      const { status, body } = await call(caller, { routeId: 'r1' });
      expect(status).toBe(200);
      expect(body.requests.map((entry: { id: string }) => entry.id)).toEqual(['req', 'amd']);
      expect(JSON.stringify(body)).not.toMatch(/spfVerdict|rawMessageKey|inbound\/raw/);
    }
  });

  it('gives staff the same list', async () => {
    for (const staff of [ADMIN, OPERATOR]) {
      expect((await call(staff, { routeId: 'r1' })).body.requests).toHaveLength(2);
    }
  });

  it("refuses a Customer User of another Customer, and a Route that doesn't exist, alike", async () => {
    for (const routeId of ['r1', 'nope']) {
      const result = await call(OTHER_OWNER, { routeId });
      expect(result.status).toBe(403);
      expect(result.body.requests).toBeUndefined();
    }
  });

  it('refuses a customer-group user with no Customer, and no session', async () => {
    expect((await call(NO_ROW, { routeId: 'r1' })).status).toBe(403);
    expect((await call(null, { routeId: 'r1' })).status).toBe(401);
  });

  it('tells staff a Route is not found', async () => {
    expect((await call(ADMIN, { routeId: 'nope' })).status).toBe(404);
  });

  it('requires a Route id', async () => {
    expect((await call(OWNER, {})).status).toBe(400);
  });
});
