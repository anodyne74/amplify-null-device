import { purgeExpiredReports, reportRetention, reportState } from './reportRetention';

const NOW = new Date('2026-09-27T03:04:05.000Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();

describe('reportRetention', () => {
  it('is active for 30 days and purged after 60', () => {
    expect(reportRetention(NOW)).toEqual({ activeUntil: at(30), purgeAfter: at(60) });
  });
});

describe('reportState', () => {
  it('is active until activeUntil, deleted until purgeAfter, then purged', () => {
    const report = { activeUntil: at(1), purgeAfter: at(31) };
    expect(reportState(report, NOW)).toBe('active');
    expect(reportState(report, new Date(at(1)))).toBe('deleted');
    expect(reportState(report, new Date(at(31)))).toBe('purged');
  });

  it('is purged once the purge job has run, whatever the dates say', () => {
    expect(reportState({ activeUntil: at(1), purgeAfter: at(31), purgedAt: at(-1) }, NOW)).toBe('purged');
  });
});

describe('purgeExpiredReports', () => {
  type Row = Record<string, unknown>;
  let reports: Row[];
  let audit: Row[];
  let deleted: string[];
  let failDelete: string | null;

  const client = {
    models: {
      PropertyHistoryReport: {
        list: async ({ filter }: { filter: { purgeAfter: { le: string } } }) => ({
          data: reports.filter((report) => (report.purgeAfter as string) <= filter.purgeAfter.le),
        }),
        update: async (input: Row) => {
          const report = reports.find((row) => row.id === input.id)!;
          Object.assign(report, input);
          return { data: report };
        },
      },
      AuditLog: {
        create: async (input: Row) => {
          audit.push(input);
          return { data: input };
        },
      },
    },
  };

  const deleteObject = async (key: string) => {
    if (key === failDelete) throw new Error('S3 said no');
    deleted.push(key);
  };

  beforeEach(() => {
    failDelete = null;
    deleted = [];
    audit = [];
    reports = [
      { id: 'old', customerId: 'c1', referenceNumber: 'PHR-1', s3Key: 'reports/c1/PHR-1.pdf', activeUntil: at(-31), purgeAfter: at(-1) },
      // Restored yesterday: both dates moved forward, so the job leaves it alone.
      { id: 'restored', customerId: 'c1', referenceNumber: 'PHR-2', s3Key: 'reports/c1/PHR-2.pdf', activeUntil: at(29), purgeAfter: at(59) },
      { id: 'gone', customerId: 'c2', referenceNumber: 'PHR-3', s3Key: 'reports/c2/PHR-3.pdf', activeUntil: at(-40), purgeAfter: at(-10), purgedAt: at(-9) },
    ];
  });

  it("destroys the PDF of each report past purgeAfter, keeps the record as a stub and logs it", async () => {
    const outcome = await purgeExpiredReports(client, deleteObject, NOW);

    expect(outcome).toEqual({ purged: ['PHR-1'], failed: [] });
    expect(deleted).toEqual(['reports/c1/PHR-1.pdf']);
    expect(reports[0]).toEqual(expect.objectContaining({ id: 'old', purgedAt: NOW.toISOString() }));
    expect(audit).toEqual([
      expect.objectContaining({
        customerId: 'c1',
        eventType: 'data_deletion',
        resourceType: 'report',
        resourceId: 'old',
        action: 'property_history_report.purge',
        status: 'success',
      }),
    ]);
  });

  it('leaves customerId off the audit entry for an all-customers report', async () => {
    reports.push({ id: 'all', customerId: null, referenceNumber: 'PHR-5', s3Key: 'reports/all-customers/PHR-5.pdf', activeUntil: at(-31), purgeAfter: at(-1) });

    await purgeExpiredReports(client, deleteObject, NOW);

    const entry = audit.find((row) => row.resourceId === 'all');
    expect(entry).toBeDefined();
    expect(entry?.customerId).toBeUndefined();
  });

  it('skips restored reports and ones already purged', async () => {
    await purgeExpiredReports(client, deleteObject, NOW);

    expect(reports[1]).not.toHaveProperty('purgedAt');
    expect(deleted).not.toContain('reports/c2/PHR-3.pdf');
  });

  it("leaves a report to try again tomorrow when its PDF can't be deleted, and carries on", async () => {
    reports.push({ id: 'old2', customerId: 'c1', referenceNumber: 'PHR-4', s3Key: 'reports/c1/PHR-4.pdf', activeUntil: at(-31), purgeAfter: at(-1) });
    failDelete = 'reports/c1/PHR-1.pdf';

    const outcome = await purgeExpiredReports(client, deleteObject, NOW);

    expect(outcome).toEqual({ purged: ['PHR-4'], failed: ['PHR-1'] });
    expect(reports[0]).not.toHaveProperty('purgedAt');
    expect(audit).toEqual([expect.objectContaining({ resourceId: 'old2', status: 'success' })]);
  });
});
