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
    Invoice: {
      get: async ({ id }: { id: string }) => ({ data: tables.Invoice.find((row) => row.id === id) ?? null }),
    },
  },
};

jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

jest.mock('@/lib/server/reportStorage', () => ({
  signedInvoicePdfUrl: async (key: string) => `https://signed.example/${key}`,
}));

import { POST } from '@/app/api/invoices/pdf/route';

const OWNER = { sub: 'sub-owner', 'cognito:groups': ['customer'] };
const READ_ONLY = { sub: 'sub-reader', 'cognito:groups': ['customer'] };
const OTHER_OWNER = { sub: 'sub-other', 'cognito:groups': ['customer'] };
const NO_ROW = { sub: 'sub-stranger', 'cognito:groups': ['customer'] };
const NO_GROUP = { sub: 'sub-nogroup' };
const ADMIN = { sub: 'sub-admin', 'cognito:groups': ['administrator'] };
const OPERATOR = { sub: 'sub-operator', 'cognito:groups': ['operator'] };

async function call(caller: object | null, body: unknown) {
  verifyMock.mockResolvedValue(caller);
  const headers = new Headers(caller ? { authorization: 'Bearer token-value' } : {});
  const response = await POST({ headers, json: async () => body } as any);
  return { status: response.status as number, body: await response.json() };
}

describe('POST /api/invoices/pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(tables, {
      CustomerUser: [
        { id: 'cu1', userSub: 'sub-owner', customerId: 'c1', role: 'account_owner' },
        { id: 'cu2', userSub: 'sub-reader', customerId: 'c1', role: 'read_only' },
        { id: 'cu3', userSub: 'sub-other', customerId: 'c2', role: 'account_owner' },
      ],
      Invoice: [
        { id: 'i1', customerId: 'c1', pdfS3Key: 'invoices/i1.pdf' },
        { id: 'i2', customerId: 'c2', pdfS3Key: 'invoices/i2.pdf' },
        { id: 'i3', customerId: 'c1', pdfS3Key: null },
      ],
    });
  });

  it("gives an Account Owner a short-lived link to their own Customer's invoice PDF", async () => {
    expect(await call(OWNER, { invoiceId: 'i1' })).toEqual({ status: 200, body: { url: 'https://signed.example/invoices/i1.pdf' } });
  });

  it('gives an administrator or an operator a link to any invoice PDF', async () => {
    for (const staff of [ADMIN, OPERATOR]) {
      expect(await call(staff, { invoiceId: 'i2' })).toEqual({ status: 200, body: { url: 'https://signed.example/invoices/i2.pdf' } });
    }
  });

  it("reports another Customer's invoice, a missing invoice and one with no PDF alike, as not found", async () => {
    for (const invoiceId of ['i2', 'nope', 'i3']) {
      const result = await call(OWNER, { invoiceId });
      expect(result.status).toBe(404);
      expect(result.body.url).toBeUndefined();
    }
    expect((await call(OTHER_OWNER, { invoiceId: 'i1' })).status).toBe(404);
  });

  it('refuses a read-only customer user', async () => {
    expect((await call(READ_ONLY, { invoiceId: 'i1' })).status).toBe(403);
  });

  it('refuses a customer-group user with no Customer', async () => {
    expect((await call(NO_ROW, { invoiceId: 'i1' })).status).toBe(403);
  });

  it('refuses a signed-in user with no group', async () => {
    expect((await call(NO_GROUP, { invoiceId: 'i1' })).status).toBe(403);
  });

  it('refuses a request with no session', async () => {
    expect((await call(null, { invoiceId: 'i1' })).status).toBe(401);
  });

  it('requires an invoice id', async () => {
    expect((await call(OWNER, {})).status).toBe(400);
  });
});
