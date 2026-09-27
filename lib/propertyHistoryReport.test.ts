import {
  canSeeReport,
  countPropertyHistory,
  describeFilters,
  describeSearch,
  newReportReference,
  reportObjectKey,
  reportRetention,
} from './propertyHistoryReport';
import type { PropertyGroup, PropertyHistoryResult } from './propertyHistory';

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

describe('reportRetention', () => {
  it('is active for 30 days and purged after 60', () => {
    expect(reportRetention(new Date('2026-09-27T03:04:05.000Z'))).toEqual({
      activeUntil: '2026-10-27T03:04:05.000Z',
      purgeAfter: '2026-11-26T03:04:05.000Z',
    });
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

describe('canSeeReport', () => {
  const customerReport = { audience: 'customer' as const, customerId: 'c1' };
  const adminReport = { audience: 'administrator' as const, customerId: 'c1' };

  it("shows an Account Owner their own Customer's customer reports only", () => {
    const owner = { audience: 'customer' as const, customerId: 'c1' };
    expect(canSeeReport(customerReport, owner)).toBe(true);
    expect(canSeeReport(adminReport, owner)).toBe(false);
    expect(canSeeReport(customerReport, { audience: 'customer', customerId: 'c2' })).toBe(false);
  });

  it('shows an administrator every report', () => {
    expect(canSeeReport(customerReport, { audience: 'administrator' })).toBe(true);
    expect(canSeeReport({ audience: 'administrator', customerId: null }, { audience: 'administrator' })).toBe(true);
  });
});
