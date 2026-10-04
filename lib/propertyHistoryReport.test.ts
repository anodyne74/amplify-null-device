import {
  canDeleteReport,
  canOpenReport,
  canRestoreReport,
  canSeeReport,
  countPropertyHistory,
  describeFilters,
  describeSearch,
  reportSearch,
  reportSummaryLine,
  reportTotals,
  newReportReference,
  reportActions,
  reportObjectKey,
} from './propertyHistoryReport';
import type { PropertyGroup, PropertyHistoryResult, VisitRow } from './propertyHistory';

const CLIFF_14 = 'epping|2121|cliff road|14';

function property(propertyKey: string, address: string, visitCount: number): PropertyGroup {
  return { propertyKey, address, visitCount, visits: [], scheduled: [] };
}

describe('newReportReference', () => {
  it('is PHR, the generation date and six random characters', () => {
    const reference = newReportReference(new Date('2026-09-27T03:04:05Z'), () => 0.5);
    expect(reference).toMatch(/^PHR-20260927-[0-9A-Z]{6}$/);
  });

  it('differs between generations on the same day', () => {
    const now = new Date('2026-09-27T03:04:05Z');
    expect(newReportReference(now, () => 0.1)).not.toBe(newReportReference(now, () => 0.9));
  });
});

describe('reportObjectKey', () => {
  it("files a Customer's report under reports/{customerId}/", () => {
    expect(reportObjectKey('c1', 'PHR-20260927-ABC123')).toBe('reports/c1/PHR-20260927-ABC123.pdf');
  });

  it('files an all-customers report under reports/all-customers/', () => {
    expect(reportObjectKey(null, 'PHR-20260927-ABC123')).toBe('reports/all-customers/PHR-20260927-ABC123.pdf');
  });
});

describe('countPropertyHistory', () => {
  it('counts Properties and Visits at every level', () => {
    const suburb: PropertyHistoryResult = {
      level: 'suburb',
      streets: [
        { street: 'cliff road', properties: [property(CLIFF_14, '14 Cliff Rd', 2), property('epping|2121|cliff road|96', '96 Cliff Rd', 0)] },
        { street: 'malton road', properties: [property('epping|2121|malton road|3', '3 Malton Rd', 1)] },
      ],
    };
    expect(countPropertyHistory(suburb)).toEqual({ propertyCount: 3, visitCount: 3 });
    expect(countPropertyHistory({ level: 'address', property: null })).toEqual({ propertyCount: 0, visitCount: 0 });
  });
});

describe('describeSearch', () => {
  it('names a suburb, a street, or the Property found', () => {
    expect(describeSearch({ level: 'suburb', suburb: 'north epping', postcode: '2121' }, { level: 'suburb', streets: [] })).toBe(
      'Suburb: North Epping 2121'
    );
    expect(
      describeSearch({ level: 'street', suburb: 'epping', postcode: '2121', street: 'cliff road' }, { level: 'street', properties: [] })
    ).toBe('Street: Cliff Road, Epping 2121');
    expect(
      describeSearch({ level: 'address', propertyKey: CLIFF_14 }, { level: 'address', property: property(CLIFF_14, '14 Cliff Rd, Epping', 1) })
    ).toBe('Address: 14 Cliff Rd, Epping');
  });

  it('names an address with no Visits from its Property key', () => {
    expect(describeSearch({ level: 'address', propertyKey: CLIFF_14 }, { level: 'address', property: null })).toBe(
      'Address: 14 Cliff Road, Epping 2121'
    );
  });
});

describe('reportSearch', () => {
  it('gives the kind of search and what it searched for separately', () => {
    expect(
      reportSearch({ level: 'street', suburb: 'epping', postcode: '2121', street: 'cliff road' }, { level: 'street', properties: [] })
    ).toEqual({ kind: 'Street', text: 'Cliff Road, Epping 2121' });
    expect(reportSearch({ level: 'suburb', suburb: 'epping', postcode: '2121' }, { level: 'suburb', streets: [] })).toEqual({
      kind: 'Suburb',
      text: 'Epping 2121',
    });
  });
});

function row(status: VisitRow['status'], signsPlaced: number, date: string | null = '2026-08-01'): VisitRow {
  return { stopId: 's', routeId: 'r', date, routeCode: 'W26-08-101', agent: null, auction: false, signsPlaced, invoices: [], status };
}

describe('reportTotals', () => {
  it('counts Properties, completed Visits and their signs, and scheduled Visits', () => {
    const result: PropertyHistoryResult = {
      level: 'suburb',
      streets: [
        {
          street: 'cliff road',
          properties: [
            { ...property('a', '14 Cliff Rd', 2), visits: [row('completed', 3), row('archived', 2)], scheduled: [row('planned', 2)] },
            { ...property('b', '16 Cliff Rd', 1), visits: [row('signs_placed', 4)], scheduled: [] },
          ],
        },
        {
          street: 'rowe street',
          properties: [{ ...property('c', '1 Rowe St', 0), visits: [], scheduled: [row('planned', 1), row('in_progress', 1)] }],
        },
      ],
    };

    expect(reportTotals(result)).toEqual({ properties: 3, completedVisits: 3, signsPlaced: 9, scheduled: 3 });
  });

  it('is all zeros when nothing matched', () => {
    expect(reportTotals({ level: 'address', property: null })).toEqual({ properties: 0, completedVisits: 0, signsPlaced: 0, scheduled: 0 });
  });
});

describe('reportSummaryLine', () => {
  it('says since the earliest dated Visit\'s year', () => {
    const result: PropertyHistoryResult = {
      level: 'street',
      properties: [{ ...property('a', '14 Cliff Rd', 2), visits: [row('completed', 1, '2026-08-01'), row('completed', 1, null), row('completed', 1, '2024-03-09')] }],
    };

    expect(reportSummaryLine('Cliff Road, Epping 2121', result)).toBe('Every sign visit on Cliff Road, Epping 2121 since 2024, newest first.');
  });

  it('leaves out "since" when no Visit has a date', () => {
    const result: PropertyHistoryResult = { level: 'street', properties: [{ ...property('a', '14 Cliff Rd', 1), visits: [row('completed', 1, null)] }] };

    expect(reportSummaryLine('Cliff Road, Epping 2121', result)).toBe('Every sign visit on Cliff Road, Epping 2121, newest first.');
    expect(reportSummaryLine('Cliff Road, Epping 2121', { level: 'street', properties: [] })).toBe(
      'Every sign visit on Cliff Road, Epping 2121, newest first.'
    );
  });
});

describe('describeFilters', () => {
  it('lists each filter set, naming the Customer', () => {
    expect(
      describeFilters({ dateFrom: '2026-01-01', dateTo: '2026-06-30', agent: 'Betty', auction: false, customerId: 'c1' }, 'Harcourts')
    ).toEqual(['From 2026-01-01', 'To 2026-06-30', 'Agent: Betty', 'Not auction', 'Customer: Harcourts']);
    expect(describeFilters({ auction: true }, null)).toEqual(['Auction only']);
  });

  it('says so when there are none', () => {
    expect(describeFilters({}, null)).toEqual(['No filters']);
  });
});

describe('report access', () => {
  const NOW = new Date('2026-09-27T03:04:05.000Z');
  const ACTIVE = { activeUntil: '2026-10-01T00:00:00.000Z', purgeAfter: '2026-11-01T00:00:00.000Z' };
  const DELETED = { activeUntil: '2026-09-01T00:00:00.000Z', purgeAfter: '2026-10-01T00:00:00.000Z' };
  const PURGED = { ...DELETED, purgedAt: '2026-09-02T00:00:00.000Z' };
  const owner = { audience: 'customer' as const, customerId: 'c1' };
  const admin = { audience: 'administrator' as const };
  const customerReport = (dates: object) => ({ audience: 'customer' as const, customerId: 'c1', ...dates });

  it("shows an Account Owner their own Customer's active customer reports only", () => {
    expect(canSeeReport(customerReport(ACTIVE), owner, NOW)).toBe(true);
    expect(canSeeReport({ ...customerReport(ACTIVE), audience: 'administrator' }, owner, NOW)).toBe(false);
    expect(canSeeReport(customerReport(ACTIVE), { audience: 'customer', customerId: 'c2' }, NOW)).toBe(false);
    expect(canSeeReport(customerReport(DELETED), owner, NOW)).toBe(false);
    expect(canSeeReport(customerReport(PURGED), owner, NOW)).toBe(false);
  });

  it('shows an administrator every report, deleted and purged too', () => {
    for (const dates of [ACTIVE, DELETED, PURGED]) {
      expect(canSeeReport(customerReport(dates), admin, NOW)).toBe(true);
    }
    expect(canSeeReport({ audience: 'administrator', customerId: null, ...ACTIVE }, admin, NOW)).toBe(true);
  });

  it("opens anything visible that hasn't been purged", () => {
    expect(canOpenReport(customerReport(DELETED), admin, NOW)).toBe(true);
    expect(canOpenReport(customerReport(PURGED), admin, NOW)).toBe(false);
    expect(canOpenReport(customerReport(ACTIVE), owner, NOW)).toBe(true);
  });

  it('lets an Account Owner delete an active report of theirs', () => {
    expect(canDeleteReport(customerReport(ACTIVE), owner, NOW)).toBe(true);
    expect(canDeleteReport(customerReport(DELETED), owner, NOW)).toBe(false);
    expect(canDeleteReport(customerReport(ACTIVE), { audience: 'customer', customerId: 'c2' }, NOW)).toBe(false);
  });

  it('lets an administrator restore a deleted report, but not a purged or active one', () => {
    expect(canRestoreReport(customerReport(DELETED), admin, NOW)).toBe(true);
    expect(canRestoreReport(customerReport(PURGED), admin, NOW)).toBe(false);
    expect(canRestoreReport(customerReport(ACTIVE), admin, NOW)).toBe(false);
    expect(canRestoreReport(customerReport(DELETED), owner, NOW)).toBe(false);
  });

  it('gathers the rules into the actions a report summary carries', () => {
    expect(reportActions(customerReport(ACTIVE), owner, NOW)).toEqual({ open: true, delete: true, restore: false });
    expect(reportActions(customerReport(ACTIVE), admin, NOW)).toEqual({ open: true, delete: false, restore: false });
    expect(reportActions(customerReport(DELETED), admin, NOW)).toEqual({ open: true, delete: false, restore: true });
    expect(reportActions(customerReport(PURGED), admin, NOW)).toEqual({ open: false, delete: false, restore: false });
  });
});
