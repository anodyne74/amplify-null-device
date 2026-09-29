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
const isFeatureOnMock = jest.fn();

jest.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: jest.fn(() => ({ verify: verifyMock })),
  },
}));

// An in-memory stand-in for the IAM client, big enough for the search and the report records.
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let failCreate: string | null = null;
let nextId = 0;

function matches(row: Row, filter?: Row): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([field, condition]) => {
    if (field === 'or') return (condition as Row[]).some((term) => matches(row, term));
    const { eq, le } = condition as { eq?: unknown; le?: string };
    return le !== undefined ? String(row[field]) <= le : row[field] === eq;
  });
}

function model(name: string) {
  const rows = () => (tables[name] ??= []);
  return {
    list: async ({ filter }: { filter?: Row } = {}) => ({ data: rows().filter((row) => matches(row, filter)) }),
    get: async ({ id }: { id: string }) => ({ data: rows().find((row) => row.id === id) ?? null }),
    create: async (input: Row) => {
      if (failCreate === name) return { data: null, errors: [{ message: 'boom' }] };
      const row = { id: `${name}-${++nextId}`, ...input };
      rows().push(row);
      return { data: row };
    },
    update: async ({ id, ...changes }: Row) => {
      const row = rows().find((candidate) => candidate.id === id);
      if (!row) return { data: null, errors: [{ message: 'not found' }] };
      Object.assign(row, changes);
      return { data: row };
    },
    delete: async ({ id }: { id: string }) => {
      tables[name] = rows().filter((row) => row.id !== id);
      return { data: { id } };
    },
  };
}

const iamClient = {
  models: {
    CustomerUser: model('CustomerUser'),
    Customer: model('Customer'),
    Route: model('Route'),
    Invoice: model('Invoice'),
    LineItem: model('LineItem'),
    AuditLog: model('AuditLog'),
    OrganizationSettings: model('OrganizationSettings'),
    PropertyHistoryReport: {
      ...model('PropertyHistoryReport'),
      listPropertyHistoryReportsByCustomer: async ({ customerId }: { customerId: string }) => ({
        data: (tables.PropertyHistoryReport ?? []).filter((row) => row.customerId === customerId),
      }),
    },
    Stop: {
      listStopsByCustomerAndPropertyKey: async (args: { customerId: string; propertyKey: { beginsWith?: string } }) => ({
        data: tables.Stop.filter(
          (stop) => stop.customerId === args.customerId && String(stop.propertyKey).startsWith(args.propertyKey.beginsWith ?? '')
        ),
      }),
      listStopsByPropertyKey: async (args: { propertyKey: string }) => ({
        data: tables.Stop.filter((stop) => stop.propertyKey === args.propertyKey),
      }),
    },
  },
};

jest.mock('@/lib/server/iamDataClient', () => ({
  getIamDataClient: () => iamClient,
}));

jest.mock('@/lib/server/featureFlags', () => ({
  isFeatureOnForCustomer: (...args: unknown[]) => isFeatureOnMock(...args),
}));

// The S3 report store, as objects in memory.
const objects = new Map<string, ArrayBuffer>();
jest.mock('@/lib/server/reportStorage', () => ({
  getReportStore: () => ({
    put: async (key: string, pdf: ArrayBuffer) => void objects.set(key, pdf),
    remove: async (key: string) => void objects.delete(key),
    signedUrl: async (key: string) => `https://signed.example/${key}`,
  }),
}));

import { POST as generate } from '@/app/api/property-history/reports/route';
import { POST as list } from '@/app/api/property-history/reports/list/route';
import { POST as open } from '@/app/api/property-history/reports/open/route';
import { POST as remove } from '@/app/api/property-history/reports/delete/route';
import { POST as restore } from '@/app/api/property-history/reports/restore/route';
import { purgeExpiredReports } from '@/lib/reportRetention';

const CLIFF_14 = 'epping|2121|cliff road|14';
const SUBURB = { search: { level: 'suburb', suburb: 'epping', postcode: '2121' } };
const OWNER = { sub: 'sub-owner', name: 'Olivia Owner', 'cognito:groups': ['customer'] };
const OTHER_OWNER = { sub: 'sub-other', name: 'Oscar Other', 'cognito:groups': ['customer'] };
const READ_ONLY = { sub: 'sub-reader', name: 'Rita Reader', 'cognito:groups': ['customer'] };
const ADMIN = { sub: 'sub-admin', name: 'Ada Admin', 'cognito:groups': ['administrator'] };

function request(body: unknown) {
  return { headers: new Headers({ authorization: 'Bearer token-value' }), json: async () => body } as any;
}

async function call(route: (request: any) => Promise<any>, caller: object, body: unknown = {}) {
  verifyMock.mockResolvedValue(caller);
  const response = await route(request(body));
  return { status: response.status as number, body: await response.json() };
}

function pdfText(key: string) {
  return Buffer.from(objects.get(key)!).toString('latin1');
}

describe('Property History Report API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    objects.clear();
    failCreate = null;
    for (const key of Object.keys(tables)) delete tables[key];
    Object.assign(tables, {
      CustomerUser: [
        { id: 'cu1', userSub: 'sub-owner', customerId: 'c1', role: 'account_owner' },
        { id: 'cu2', userSub: 'sub-reader', customerId: 'c1', role: 'read_only' },
        { id: 'cu3', userSub: 'sub-other', customerId: 'c2', role: 'account_owner' },
      ],
      Customer: [
        { id: 'c1', name: 'Harcourts Epping' },
        { id: 'c2', name: 'Ray White' },
      ],
      Route: [
        { id: 'r1', routeCode: 'W26-08-101', scheduledDate: '2026-08-01', status: 'completed', customerId: 'c1', assignedOperatorName: 'Sam' },
        { id: 'r2', routeCode: 'W26-08-202', scheduledDate: '2026-08-02', status: 'completed', customerId: 'c2', assignedOperatorName: 'Sam' },
      ],
      Stop: [
        { id: 's1', routeId: 'r1', customerId: 'c1', propertyKey: CLIFF_14, address: '14 Cliff Rd, Epping', numberOfSigns: 2, missingSignsCount: 1 },
        { id: 's2', routeId: 'r2', customerId: 'c2', propertyKey: CLIFF_14, address: '14 Cliff Rd, Epping', numberOfSigns: 1 },
      ],
      Invoice: [
        { id: 'i1', invoiceNumber: 'INV-0001', routeId: 'r1', status: 'sent', customerId: 'c1' },
        { id: 'i2', invoiceNumber: 'INV-0002', routeId: 'r2', status: 'draft', customerId: 'c2' },
      ],
      LineItem: [],
      OrganizationSettings: [{ id: 'organization', companyName: 'Null Device Signs', abn: 'ABN 1', phone: '02 9999', address: '1 Yard St' }],
    });
    isFeatureOnMock.mockResolvedValue(true);
  });

  describe('generating', () => {
    it("files an Account Owner's report under their Customer, records it, logs it and returns a signed link", async () => {
      const { status, body } = await call(generate, OWNER, SUBURB);

      expect(status).toBe(200);
      const key = `reports/c1/${body.report.referenceNumber}.pdf`;
      expect(body.url).toBe(`https://signed.example/${key}`);
      expect(body.report).toEqual(
        expect.objectContaining({
          audience: 'customer',
          customerId: 'c1',
          customerName: 'Harcourts Epping',
          generatedByName: 'Olivia Owner',
          searchLabel: 'Suburb: Epping 2121',
          propertyCount: 1,
          visitCount: 1,
        })
      );
      expect(tables.PropertyHistoryReport).toEqual([
        expect.objectContaining({ s3Key: key, generatedBySub: 'sub-owner', audience: 'customer', activeUntil: expect.any(String), purgeAfter: expect.any(String) }),
      ]);
      expect(tables.AuditLog).toEqual([
        expect.objectContaining({ resourceType: 'report', resourceId: body.report.id, operatorId: 'sub-owner', customerId: 'c1', status: 'success' }),
      ]);
      expect(objects.has(key)).toBe(true);
    });

    it("holds a customer's report to their own Customer and the customer-safe fields", async () => {
      const { body } = await call(generate, OWNER, { ...SUBURB, filters: { customerId: 'c2' } });
      const text = pdfText(`reports/c1/${body.report.referenceNumber}.pdf`);

      expect(body.report.customerId).toBe('c1');
      expect(text).toContain('W26-08-101');
      expect(text).not.toContain('W26-08-202');
      expect(text).not.toContain('Missing Signs');
      expect(text).not.toContain('Sam');
    });

    it("files an administrator's all-customers report with the staff fields", async () => {
      const { status, body } = await call(generate, ADMIN, SUBURB);

      expect(status).toBe(200);
      expect(body.report).toEqual(expect.objectContaining({ audience: 'administrator', customerId: null, customerName: null, visitCount: 2 }));
      const text = pdfText(`reports/all-customers/${body.report.referenceNumber}.pdf`);
      expect(text).toContain('All customers');
      expect(text).toContain('Missing Signs');
      expect(text).toContain('INV-0002');
    });

    it('never changes once generated, whatever happens to the Routes and Invoices', async () => {
      const { body } = await call(generate, OWNER, SUBURB);
      const key = `reports/c1/${body.report.referenceNumber}.pdf`;
      const before = pdfText(key);

      tables.Route[0].routeCode = 'EDITED-ROUTE';
      tables.Invoice[0].invoiceNumber = 'INV-EDITED';
      const reopened = await call(open, OWNER, { reportId: body.report.id });

      expect(reopened.body.url).toBe(`https://signed.example/${key}`);
      expect(pdfText(key)).toBe(before);
      expect(before).toContain('W26-08-101');
      expect(before).not.toContain('EDITED');
    });

    it('refuses a read-only customer user', async () => {
      expect((await call(generate, READ_ONLY, SUBURB)).status).toBe(403);
      expect(objects.size).toBe(0);
    });

    it("refuses a customer while the flag is off for their Customer, but not an administrator", async () => {
      isFeatureOnMock.mockResolvedValue(false);
      expect((await call(generate, OWNER, SUBURB)).status).toBe(403);
      expect((await call(generate, ADMIN, SUBURB)).status).toBe(200);
    });

    it('refuses an operator', async () => {
      expect((await call(generate, { sub: 'sub-op', 'cognito:groups': ['operator'] }, SUBURB)).status).toBe(403);
    });

    it('rejects a malformed search', async () => {
      expect((await call(generate, OWNER, { search: { level: 'suburb' } })).status).toBe(400);
    });

    it("keeps nothing when the generation can't be logged", async () => {
      failCreate = 'AuditLog';
      const { status } = await call(generate, OWNER, SUBURB);

      expect(status).toBe(500);
      expect(tables.PropertyHistoryReport).toEqual([]);
      expect(objects.size).toBe(0);
    });
  });

  describe('listing and opening', () => {
    async function generateAll() {
      const own = (await call(generate, OWNER, SUBURB)).body.report;
      const other = (await call(generate, OTHER_OWNER, SUBURB)).body.report;
      const adminForC1 = (await call(generate, ADMIN, { ...SUBURB, filters: { customerId: 'c1' } })).body.report;
      return { own, other, adminForC1 };
    }

    it("shows an Account Owner their own Customer's customer reports only", async () => {
      const { own } = await generateAll();
      const { body } = await call(list, OWNER);

      expect(body.reports.map((report: { id: string }) => report.id)).toEqual([own.id]);
    });

    it('shows an administrator every report', async () => {
      const { own, other, adminForC1 } = await generateAll();
      const { body } = await call(list, ADMIN);

      expect(body.reports.map((report: { id: string }) => report.id).sort()).toEqual([own.id, other.id, adminForC1.id].sort());
    });

    it("gives each report the actions its caller may take", async () => {
      const { own } = await generateAll();

      expect(own.actions).toEqual({ open: true, delete: true, restore: false });
      expect((await call(list, OWNER)).body.reports[0].actions).toEqual({ open: true, delete: true, restore: false });
      expect((await call(list, ADMIN)).body.reports.map((report: { actions: unknown }) => report.actions)).toEqual([
        { open: true, delete: false, restore: false },
        { open: true, delete: false, restore: false },
        { open: true, delete: false, restore: false },
      ]);
    });

    it("won't open another Customer's report, or an administrator's, for a customer", async () => {
      const { other, adminForC1 } = await generateAll();

      expect((await call(open, OWNER, { reportId: other.id })).status).toBe(404);
      expect((await call(open, OWNER, { reportId: adminForC1.id })).status).toBe(404);
      expect((await call(open, ADMIN, { reportId: other.id })).status).toBe(200);
    });

    it('shows a read-only customer user no reports', async () => {
      await generateAll();
      expect((await call(list, READ_ONLY)).status).toBe(403);
      expect((await call(open, READ_ONLY, { reportId: 'PropertyHistoryReport-1' })).status).toBe(403);
    });

    it('requires a report id to open', async () => {
      expect((await call(open, OWNER, {})).status).toBe(400);
    });
  });

  describe('retention', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const START = new Date('2026-09-27T00:00:00.000Z');
    const days = (count: number) => new Date(START.getTime() + count * DAY);
    const ids = (body: { reports: { id: string }[] }) => body.reports.map((report) => report.id);
    const purge = (at: Date) =>
      purgeExpiredReports(iamClient as never, async (key) => void objects.delete(key), at);

    beforeEach(() => {
      // Only the clock is faked; the routes read it through new Date().
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'queueMicrotask'] });
      jest.setSystemTime(START);
    });

    afterEach(() => jest.useRealTimers());

    async function generateDeleted() {
      const report = (await call(generate, OWNER, SUBURB)).body.report;
      jest.setSystemTime(days(5));
      expect((await call(remove, OWNER, { reportId: report.id })).status).toBe(200);
      return report;
    }

    it("lets an Account Owner delete their report, hiding it from customers but not administrators, and logs it", async () => {
      const report = await generateDeleted();

      expect(ids((await call(list, OWNER)).body)).toEqual([]);
      expect((await call(open, OWNER, { reportId: report.id })).status).toBe(404);
      const adminView = (await call(list, ADMIN)).body.reports;
      expect(adminView).toEqual([expect.objectContaining({ id: report.id, state: 'deleted', activeUntil: days(5).toISOString() })]);
      expect((await call(open, ADMIN, { reportId: report.id })).status).toBe(200);
      expect(tables.AuditLog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'data_deletion', action: 'property_history_report.delete', resourceId: report.id, operatorId: 'sub-owner' }),
        ])
      );
    });

    it("won't let anyone else delete a report", async () => {
      const report = (await call(generate, OWNER, SUBURB)).body.report;

      expect((await call(remove, OTHER_OWNER, { reportId: report.id })).status).toBe(404);
      expect((await call(remove, READ_ONLY, { reportId: report.id })).status).toBe(403);
      expect((await call(remove, ADMIN, { reportId: report.id })).status).toBe(404);
      expect((await call(list, OWNER)).body.reports).toHaveLength(1);
    });

    it('drops a report from customers on its own once activeUntil passes', async () => {
      await call(generate, OWNER, SUBURB);
      jest.setSystemTime(days(30));

      expect(ids((await call(list, OWNER)).body)).toEqual([]);
      expect((await call(list, ADMIN)).body.reports).toEqual([expect.objectContaining({ state: 'deleted' })]);
    });

    it('restores a deleted report for a fresh 30 days, moving both dates forward, and logs it', async () => {
      const report = await generateDeleted();
      const before = tables.PropertyHistoryReport[0];
      const purgeAfterBefore = before.purgeAfter as string;
      jest.setSystemTime(days(20));

      const { status, body } = await call(restore, ADMIN, { reportId: report.id });

      expect(status).toBe(200);
      expect(body.report).toEqual(
        expect.objectContaining({ state: 'active', activeUntil: days(50).toISOString(), purgeAfter: days(80).toISOString() })
      );
      expect(body.report.purgeAfter > purgeAfterBefore).toBe(true);
      expect(ids((await call(list, OWNER)).body)).toEqual([report.id]);
      expect(tables.AuditLog).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: 'data_modification', action: 'property_history_report.restore', resourceId: report.id, operatorId: 'sub-admin' }),
        ])
      );

      // Past the original purgeAfter, the purge job leaves the restored report alone.
      expect(await purge(days(61))).toEqual({ purged: [], failed: [] });
      expect(objects.size).toBe(1);
    });

    it("won't restore an active report, or for a customer", async () => {
      const report = (await call(generate, OWNER, SUBURB)).body.report;

      expect((await call(restore, ADMIN, { reportId: report.id })).status).toBe(404);
      expect((await call(restore, OWNER, { reportId: report.id })).status).toBe(403);
    });

    it('lets an administrator open and restore a deleted report, and returns it restored with no Restore left', async () => {
      const report = await generateDeleted();

      expect((await call(list, ADMIN)).body.reports[0].actions).toEqual({ open: true, delete: false, restore: true });
      expect((await call(restore, ADMIN, { reportId: report.id })).body.report.actions).toEqual({
        open: true,
        delete: false,
        restore: false,
      });
    });

    it('purges the PDF but keeps the record as a stub, with its log history, which cannot be restored', async () => {
      const report = await generateDeleted();

      expect(await purge(days(60))).toEqual({ purged: [report.referenceNumber], failed: [] });

      expect(objects.size).toBe(0);
      expect((await call(list, ADMIN)).body.reports).toEqual([
        expect.objectContaining({ id: report.id, state: 'purged', actions: { open: false, delete: false, restore: false } }),
      ]);
      expect((await call(open, ADMIN, { reportId: report.id })).status).toBe(404);
      expect((await call(restore, ADMIN, { reportId: report.id })).status).toBe(404);
      expect(tables.AuditLog.map((entry) => entry.action)).toEqual([
        'property_history_report.generate',
        'property_history_report.delete',
        'property_history_report.purge',
      ]);
    });

    it("doesn't change a report whose delete can't be logged", async () => {
      const report = (await call(generate, OWNER, SUBURB)).body.report;
      const activeUntil = tables.PropertyHistoryReport[0].activeUntil;
      failCreate = 'AuditLog';

      expect((await call(remove, OWNER, { reportId: report.id })).status).toBe(500);
      expect(tables.PropertyHistoryReport[0].activeUntil).toBe(activeUntil);
    });
  });
});
