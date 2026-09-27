jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

const verifyMock = jest.fn();
const isFeatureOnMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

// An in-memory stand-in for the IAM client, just big enough for the search's reads.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const stopQueries: { customerId?: string; propertyKey: unknown }[] = [];

function matches(row: Row, filter?: Row): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([field, condition]) =>
    field === 'or'
      ? (condition as Row[]).some((term) => matches(row, term))
      : row[field] === (condition as { eq: unknown }).eq
  );
}

function keyMatches(key: unknown, condition: { eq?: string; beginsWith?: string }) {
  return typeof key === 'string' && (condition.eq !== undefined ? key === condition.eq : key.startsWith(condition.beginsWith ?? ''));
}

function model(name: string) {
  return {
    list: async ({ filter }: { filter?: Row } = {}) => ({ data: (tables[name] ?? []).filter((row) => matches(row, filter)) }),
    get: async ({ id }: { id: string }) => ({ data: (tables[name] ?? []).find((row) => row.id === id) ?? null }),
  };
}

const iamClient = {
  models: {
    CustomerUser: model('CustomerUser'),
    Customer: model('Customer'),
    Route: model('Route'),
    Invoice: model('Invoice'),
    LineItem: model('LineItem'),
    Stop: {
      listStopsByCustomerAndPropertyKey: async (args: { customerId: string; propertyKey: { eq?: string; beginsWith?: string } }) => {
        stopQueries.push(args);
        return { data: tables.Stop.filter((stop) => stop.customerId === args.customerId && keyMatches(stop.propertyKey, args.propertyKey)) };
      },
      listStopsByPropertyKey: async (args: { propertyKey: string }) => {
        stopQueries.push(args);
        return { data: tables.Stop.filter((stop) => stop.propertyKey === args.propertyKey) };
      },
    },
  },
};

// Mocked wholesale so tests never import @aws-sdk/credential-provider-node
// (ESM-only, which jest's CJS transform can't load).
jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

jest.mock('@/lib/server/featureFlags', () => ({
  isFeatureOnForCustomer: (...args: unknown[]) => isFeatureOnMock(...args),
}));

import { POST } from '@/app/api/property-history/search/route';

const CLIFF_14 = 'epping|2121|cliff road|14';

function makeRequest(body: unknown) {
  return { headers: new Headers({ authorization: 'Bearer token-value' }), json: async () => body } as any;
}

const SUBURB_SEARCH = { search: { level: 'suburb', suburb: 'Epping' } };

describe('Property History search API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stopQueries.length = 0;
    Object.assign(tables, {
      CustomerUser: [{ id: 'cu1', userSub: 'sub-customer', customerId: 'c1' }],
      Customer: [
        { id: 'c1', name: 'Harcourts Epping' },
        { id: 'c2', name: 'Ray White' },
      ],
      Route: [
        { id: 'r1', routeCode: 'W26-08-101', scheduledDate: '2026-08-01', status: 'completed', customerId: 'c1', assignedOperatorName: 'Sam' },
        { id: 'r2', routeCode: 'W26-08-202', scheduledDate: '2026-08-02', status: 'completed', customerId: 'c2' },
      ],
      Stop: [
        { id: 's1', routeId: 'r1', customerId: 'c1', propertyKey: CLIFF_14, address: '14 Cliff Rd', numberOfSigns: 2 },
        { id: 's2', routeId: 'r2', customerId: 'c2', propertyKey: CLIFF_14, address: '14 Cliff Road', numberOfSigns: 1 },
      ],
      Invoice: [
        { id: 'i1', invoiceNumber: 'INV-0001', routeId: 'r1', status: 'draft', customerId: 'c1' },
        { id: 'i2', invoiceNumber: 'INV-0002', routeId: 'r2', status: 'sent', customerId: 'c2' },
      ],
      LineItem: [],
    });
    verifyMock.mockResolvedValue({ sub: 'sub-customer', 'cognito:groups': ['customer'] });
    isFeatureOnMock.mockResolvedValue(true);
  });

  async function visits(body: unknown) {
    const response = await POST(makeRequest(body));
    const result = await response.json();
    return { status: response.status, result, rows: (result.streets ?? []).flatMap((s: any) => s.properties.flatMap((p: any) => p.visits)) };
  }

  it('returns 401 without a token', async () => {
    const response = await POST({ headers: new Headers(), json: async () => SUBURB_SEARCH } as any);
    expect(response.status).toBe(401);
  });

  it('returns 403 for an operator', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-op', 'cognito:groups': ['operator'] });
    expect((await POST(makeRequest(SUBURB_SEARCH))).status).toBe(403);
    expect(stopQueries).toEqual([]);
  });

  it('returns 400 for a malformed search', async () => {
    expect((await POST(makeRequest({ search: { level: 'suburb' } }))).status).toBe(400);
  });

  describe('for a customer', () => {
    it("returns only their own Customer's Stops, without admin-only fields or draft Invoices", async () => {
      const { status, rows } = await visits(SUBURB_SEARCH);

      expect(status).toBe(200);
      expect(rows).toEqual([expect.objectContaining({ stopId: 's1', invoices: [] })]);
      expect(rows[0]).not.toHaveProperty('customerName');
      expect(rows[0]).not.toHaveProperty('operatorName');
      expect(stopQueries).toEqual([{ customerId: 'c1', propertyKey: { beginsWith: 'epping|' } }]);
    });

    it("never returns another Customer's Stops, whatever Customer the request asks for", async () => {
      const { rows } = await visits({ ...SUBURB_SEARCH, filters: { customerId: 'c2' }, customerId: 'c2' });

      expect(rows.map((row: any) => row.stopId)).toEqual(['s1']);
      expect(stopQueries.every((query) => query.customerId === 'c1')).toBe(true);
    });

    it('checks the Property History flag for their own Customer, and refuses while it is off', async () => {
      isFeatureOnMock.mockResolvedValue(false);

      const response = await POST(makeRequest(SUBURB_SEARCH));

      expect(response.status).toBe(403);
      expect(isFeatureOnMock).toHaveBeenCalledWith(iamClient, 'c1', 'property-history');
      expect(stopQueries).toEqual([]);
    });

    it('refuses a customer user with no Customer', async () => {
      tables.CustomerUser = [];
      expect((await POST(makeRequest(SUBURB_SEARCH))).status).toBe(403);
      expect(stopQueries).toEqual([]);
    });
  });

  describe('for an administrator', () => {
    beforeEach(() => {
      verifyMock.mockResolvedValue({ sub: 'sub-admin', 'cognito:groups': ['administrator'] });
    });

    it('searches every Customer without checking the flag, with admin-only fields and draft Invoices', async () => {
      const { rows } = await visits(SUBURB_SEARCH);

      expect(isFeatureOnMock).not.toHaveBeenCalled();
      expect(rows.map((row: any) => [row.stopId, row.customerName, row.invoices.map((i: any) => i.invoiceNumber)])).toEqual([
        ['s2', 'Ray White', ['INV-0002']],
        ['s1', 'Harcourts Epping', ['INV-0001']],
      ]);
      expect(rows[1]).toMatchObject({ operatorName: 'Sam' });
    });

    it("finds an Invoice through a line item for the Route, even when the Invoice's own routeId is another Route", async () => {
      tables.Invoice.push({ id: 'i3', invoiceNumber: 'INV-0003', routeId: 'r-other', status: 'paid', customerId: 'c1' });
      tables.LineItem = [{ id: 'li1', invoiceId: 'i3', routeId: 'r1' }];

      const { rows } = await visits(SUBURB_SEARCH);

      expect(rows.find((row: any) => row.stopId === 's1').invoices.map((i: any) => i.invoiceNumber)).toEqual(['INV-0001', 'INV-0003']);
    });

    it('narrows to one Customer on request', async () => {
      const { rows } = await visits({ ...SUBURB_SEARCH, filters: { customerId: 'c2' } });

      expect(rows.map((row: any) => row.stopId)).toEqual(['s2']);
      expect(stopQueries).toEqual([{ customerId: 'c2', propertyKey: { beginsWith: 'epping|' } }]);
    });

    it('looks up an exact address across Customers through the Property index', async () => {
      const response = await POST(makeRequest({ search: { level: 'address', propertyKey: CLIFF_14 } }));
      const result = await response.json();

      expect(stopQueries).toEqual([{ propertyKey: CLIFF_14 }]);
      expect(result.property).toMatchObject({ propertyKey: CLIFF_14, visitCount: 2 });
    });
  });

  it('returns 500 rather than a partial history when a read fails', async () => {
    verifyMock.mockResolvedValue({ sub: 'sub-admin', 'cognito:groups': ['administrator'] });
    const get = iamClient.models.Route.get;
    iamClient.models.Route.get = async () => ({ data: null, errors: [{ message: 'boom' }] }) as any;
    try {
      expect((await POST(makeRequest(SUBURB_SEARCH))).status).toBe(500);
    } finally {
      iamClient.models.Route.get = get;
    }
  });
});
