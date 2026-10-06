import {
  buildPropertyHistory,
  invoiceLabel,
  parsePropertyHistoryRequest,
  propertyKeyCondition,
  resolveRouteInvoices,
  type HistoryRoute,
  type HistoryStop,
} from './propertyHistory';

const ROUTES: Record<string, HistoryRoute> = {
  r1: { id: 'r1', routeCode: 'W26-08-101', scheduledDate: '2026-08-01', status: 'completed', customerId: 'c1', assignedOperatorName: 'Sam' },
  r2: { id: 'r2', routeCode: 'W26-08-202', scheduledDate: '2026-08-15', status: 'signs_placed', customerId: 'c1' },
  r3: { id: 'r3', routeCode: 'W26-10-303', scheduledDate: '2026-10-03', status: 'planned', customerId: 'c1' },
  r4: { id: 'r4', routeCode: 'W26-09-404', scheduledDate: '2026-09-04', status: 'in_progress', customerId: 'c1' },
  r5: { id: 'r5', routeCode: 'W26-07-505', scheduledDate: '2026-07-05', status: 'archived', customerId: 'c2' },
};

let nextId = 0;
function stop(propertyKey: string, routeId: string, overrides: Partial<HistoryStop> = {}): HistoryStop {
  nextId += 1;
  return {
    id: `s${nextId}`,
    routeId,
    customerId: ROUTES[routeId].customerId,
    propertyKey,
    address: `${propertyKey.split('|')[3]} ${propertyKey.split('|')[2]}, ${propertyKey.split('|')[0]}`,
    agent: 'Betty',
    isAuction: false,
    numberOfSigns: 2,
    ...overrides,
  };
}

const CLIFF_14 = 'epping|2121|cliff road|14';
const CLIFF_96 = 'epping|2121|cliff road|96';
const CLIFF_100 = 'epping|2121|cliff road|100';
const PENNANT_3 = 'epping|2121|pennant street|3';

function build(stops: HistoryStop[], overrides: Partial<Parameters<typeof buildPropertyHistory>[0]> = {}) {
  return buildPropertyHistory({
    search: { level: 'suburb', suburb: 'Epping' },
    filters: {},
    stops,
    routesById: ROUTES,
    invoicesByRouteId: new Map(),
    customerNamesById: { c1: 'Harcourts Epping', c2: 'Ray White' },
    audience: 'customer',
    ...overrides,
  });
}

describe('buildPropertyHistory grouping', () => {
  it('groups a suburb search by Street, then Property', () => {
    const result = build([stop(CLIFF_14, 'r1'), stop(PENNANT_3, 'r1'), stop(CLIFF_96, 'r2')]);

    expect(result.level).toBe('suburb');
    if (result.level !== 'suburb') return;
    expect(result.streets.map((street) => [street.street, street.properties.map((p) => p.propertyKey)])).toEqual([
      ['cliff road', [CLIFF_14, CLIFF_96]],
      ['pennant street', [PENNANT_3]],
    ]);
  });

  it('groups a street search by Property only, ordering street numbers numerically', () => {
    const result = build([stop(CLIFF_100, 'r1'), stop(CLIFF_96, 'r1'), stop(CLIFF_14, 'r1')], {
      search: { level: 'street', suburb: 'Epping', postcode: '2121', street: 'Cliff Rd' },
    });

    expect(result.level).toBe('street');
    if (result.level !== 'street') return;
    expect(result.properties.map((p) => p.propertyKey)).toEqual([CLIFF_14, CLIFF_96, CLIFF_100]);
  });

  it('returns one Property for an address search, or null when it has no rows', () => {
    const search = { level: 'address' as const, propertyKey: CLIFF_14 };

    const found = build([stop(CLIFF_14, 'r1')], { search });
    expect(found.level === 'address' && found.property?.propertyKey).toBe(CLIFF_14);

    const none = build([], { search });
    expect(none).toEqual({ level: 'address', property: null });
  });

  it("labels a Property with its most recent Visit's entered address", () => {
    const result = build([stop(CLIFF_14, 'r1', { address: '14 Cliff Rd' }), stop(CLIFF_14, 'r2', { address: '14 Cliff Road, Epping' })], {
      search: { level: 'address', propertyKey: CLIFF_14 },
    });

    expect(result.level === 'address' && result.property?.address).toBe('14 Cliff Road, Epping');
  });

  it('labels a Property with no entered address from its key, never the raw key', () => {
    const result = build([stop(CLIFF_14, 'r1', { address: null })], { search: { level: 'address', propertyKey: CLIFF_14 } });

    expect(result.level === 'address' && result.property?.address).toBe('14 Cliff Road, Epping 2121');
  });
});

describe('buildPropertyHistory counting', () => {
  function property(stops: HistoryStop[], overrides = {}) {
    const result = build(stops, { search: { level: 'address', propertyKey: CLIFF_14 }, ...overrides });
    if (result.level !== 'address' || !result.property) throw new Error('expected a property');
    return result.property;
  }

  it('counts Visits on Routes at signs_placed or later, newest first', () => {
    const p = property([stop(CLIFF_14, 'r1'), stop(CLIFF_14, 'r2'), stop(CLIFF_14, 'r5')]);

    expect(p.visitCount).toBe(3);
    expect(p.visits.map((v) => v.routeCode)).toEqual(['W26-08-202', 'W26-08-101', 'W26-07-505']);
  });

  it("still counts a Visit whose signs were placed but couldn't be collected", () => {
    const p = property([stop(CLIFF_14, 'r1', { notes: '[PLACEMENT_DONE:2026-08-01T01:00:00Z] [PICKUP_SKIPPED:2026-08-02T01:00:00Z]' })]);

    expect(p.visitCount).toBe(1);
    expect(p.visits[0].status).toBe('completed');
  });

  it('puts planned and in-progress Routes in Scheduled, soonest first, never counted', () => {
    const p = property([stop(CLIFF_14, 'r1'), stop(CLIFF_14, 'r3'), stop(CLIFF_14, 'r4')]);

    expect(p.visitCount).toBe(1);
    expect(p.visits.map((v) => v.routeCode)).toEqual(['W26-08-101']);
    expect(p.scheduled.map((v) => v.routeCode)).toEqual(['W26-09-404', 'W26-10-303']);
  });

  it('keeps a Property with only Scheduled Routes', () => {
    expect(property([stop(CLIFF_14, 'r3')])).toMatchObject({ visitCount: 0, visits: [], scheduled: [expect.anything()] });
  });

  it('drops Stops whose Route no longer exists', () => {
    expect(build([stop(CLIFF_14, 'r1', { routeId: 'gone' })], { search: { level: 'address', propertyKey: CLIFF_14 } })).toEqual({
      level: 'address',
      property: null,
    });
  });
});

describe('buildPropertyHistory rows', () => {
  const invoicesByRouteId = new Map([['r1', [{ id: 'i1', invoiceNumber: 'INV-0001' }]]]);

  it('carries the row fields, and no admin-only fields for a customer', () => {
    const result = build([stop(CLIFF_14, 'r1', { agent: 'Betty', isAuction: true, numberOfSigns: 3, missingSignsCount: 1 })], {
      search: { level: 'address', propertyKey: CLIFF_14 },
      invoicesByRouteId,
    });

    expect(result.level === 'address' && result.property?.visits[0]).toEqual({
      stopId: expect.any(String),
      routeId: 'r1',
      date: '2026-08-01',
      routeCode: 'W26-08-101',
      agent: 'Betty',
      auction: true,
      signsPlaced: 3,
      invoices: [{ id: 'i1', invoiceNumber: 'INV-0001' }],
      status: 'completed',
    });
  });

  it('adds Customer, Operator, Missing Signs and Location Precision for an administrator', () => {
    const result = build([stop(CLIFF_14, 'r1', { missingSignsCount: 1, locationPrecision: 'approximate' })], {
      search: { level: 'address', propertyKey: CLIFF_14 },
      audience: 'administrator',
    });

    expect(result.level === 'address' && result.property?.visits[0]).toMatchObject({
      customerName: 'Harcourts Epping',
      operatorName: 'Sam',
      missingSigns: 1,
      locationPrecision: 'approximate',
    });
  });
});

describe('buildPropertyHistory filters', () => {
  const stops = [
    stop(CLIFF_14, 'r1', { agent: 'Betty', isAuction: true }),
    stop(CLIFF_14, 'r2', { agent: 'Frank' }),
    stop(CLIFF_96, 'r5', { agent: 'betty ' }),
  ];

  function keysAndRoutes(filters: object, audience: 'customer' | 'administrator' = 'administrator') {
    const result = build(stops, { filters, audience });
    if (result.level !== 'suburb') throw new Error('expected suburb');
    return result.streets.flatMap((s) => s.properties.flatMap((p) => p.visits.map((v) => `${p.propertyKey}@${v.routeId}`)));
  }

  it('filters by date range, inclusive', () => {
    expect(keysAndRoutes({ dateFrom: '2026-08-01', dateTo: '2026-08-14' })).toEqual([`${CLIFF_14}@r1`]);
  });

  it('filters by Agent, ignoring case and spacing, and drops Properties left empty', () => {
    expect(keysAndRoutes({ agent: 'BETTY' })).toEqual([`${CLIFF_14}@r1`, `${CLIFF_96}@r5`]);
  });

  it('filters by Auction', () => {
    expect(keysAndRoutes({ auction: true })).toEqual([`${CLIFF_14}@r1`]);
    expect(keysAndRoutes({ auction: false })).toEqual([`${CLIFF_14}@r2`, `${CLIFF_96}@r5`]);
  });

  it('filters by Customer', () => {
    expect(keysAndRoutes({ customerId: 'c2' })).toEqual([`${CLIFF_96}@r5`]);
  });
});

describe('resolveRouteInvoices', () => {
  const invoices = [
    { id: 'i1', invoiceNumber: 'INV-0002', routeId: 'r1', status: 'sent' as const },
    { id: 'i2', invoiceNumber: 'INV-0001', status: 'paid' as const },
    { id: 'i3', invoiceNumber: 'INV-0003', routeId: 'r2', status: 'draft' as const },
  ];
  const lineItems = [
    { invoiceId: 'i2', routeId: 'r1' },
    { invoiceId: 'i2', routeId: 'r1' },
    { invoiceId: 'i1', routeId: 'r1' },
  ];

  it('links an Invoice by Invoice.routeId or by a LineItem for the route, once each, by number', () => {
    expect(resolveRouteInvoices(invoices, lineItems, 'administrator').get('r1')).toEqual([
      { id: 'i2', invoiceNumber: 'INV-0001' },
      { id: 'i1', invoiceNumber: 'INV-0002' },
    ]);
  });

  it('shows staff draft Invoices, but customers only sent or paid ones', () => {
    expect(resolveRouteInvoices(invoices, lineItems, 'administrator').get('r2')).toEqual([{ id: 'i3', invoiceNumber: 'INV-0003' }]);
    expect(resolveRouteInvoices(invoices, lineItems, 'customer').get('r2')).toBeUndefined();
  });
});

describe('propertyKeyCondition', () => {
  it('matches a suburb or street exactly by delimited prefix, and an address by key', () => {
    expect(propertyKeyCondition({ level: 'suburb', suburb: 'Epping' })).toEqual({ beginsWith: 'epping|' });
    expect(propertyKeyCondition({ level: 'suburb', suburb: 'Epping', postcode: '2121' })).toEqual({ beginsWith: 'epping|2121|' });
    expect(propertyKeyCondition({ level: 'street', suburb: 'Epping', postcode: '2121', street: 'Cliff Rd' })).toEqual({
      beginsWith: 'epping|2121|cliff road|',
    });
    expect(propertyKeyCondition({ level: 'address', propertyKey: CLIFF_14 })).toEqual({ eq: CLIFF_14 });
  });
});

describe('parsePropertyHistoryRequest', () => {
  it('reads each search level and the filters', () => {
    expect(
      parsePropertyHistoryRequest({
        search: { level: 'street', suburb: 'Epping', postcode: '2121', street: 'Cliff Rd' },
        filters: { dateFrom: '2026-01-01', dateTo: '2026-12-31', agent: 'Betty', auction: true, customerId: 'c1' },
      })
    ).toEqual({
      search: { level: 'street', suburb: 'Epping', postcode: '2121', street: 'Cliff Rd' },
      filters: { dateFrom: '2026-01-01', dateTo: '2026-12-31', agent: 'Betty', auction: true, customerId: 'c1' },
    });
    expect(parsePropertyHistoryRequest({ search: { level: 'address', propertyKey: CLIFF_14 } })).toEqual({
      search: { level: 'address', propertyKey: CLIFF_14 },
      filters: {},
    });
  });

  it.each([
    [null],
    [{}],
    [{ search: { level: 'suburb', suburb: '  ' } }],
    [{ search: { level: 'street', suburb: 'Epping', street: 'Cliff Rd' } }],
    [{ search: { level: 'address', propertyKey: 'not a key' } }],
    [{ search: { level: 'anything', suburb: 'Epping' } }],
    [{ search: { level: 'suburb', suburb: 'Epping' }, filters: { dateFrom: 'yesterday' } }],
    [{ search: { level: 'suburb', suburb: 'Epping' }, filters: { auction: 'yes' } }],
  ])('rejects %j', (body) => {
    expect(parsePropertyHistoryRequest(body)).toBeNull();
  });
});

describe('invoiceLabel', () => {
  it('lists invoice numbers, or says the row is not yet invoiced', () => {
    expect(invoiceLabel([{ id: 'i1', invoiceNumber: 'INV-0001' }, { id: 'i2', invoiceNumber: 'INV-0002' }])).toBe('INV-0001, INV-0002');
    expect(invoiceLabel([])).toBe('Not yet invoiced');
  });
});

describe('buildPropertyHistory undated Routes (#388)', () => {
  // Imported Routes have no scheduledDate; their run date is in their start times.
  const IMPORTED: Record<string, HistoryRoute> = {
    ...ROUTES,
    started: { id: 'started', routeCode: 'W24-25-011', actualStartTime: '2025-06-10T00:00:00.000Z', status: 'completed', customerId: 'c1' },
    placed: { id: 'placed', routeCode: 'W24-25-022', placementStartTime: '2025-06-20T00:00:00.000Z', status: 'completed', customerId: 'c1' },
    undatedA: { id: 'undatedA', routeCode: 'W12-24-001', status: 'completed', customerId: 'c1' },
    undatedB: { id: 'undatedB', routeCode: 'W40-24-001', status: 'completed', customerId: 'c1' },
    undatedPlanned: { id: 'undatedPlanned', routeCode: 'W50-26-001', status: 'planned', customerId: 'c1' },
    scheduledKept: {
      id: 'scheduledKept',
      routeCode: 'W30-25-001',
      scheduledDate: '2025-07-21',
      actualStartTime: '2025-07-23T00:00:00.000Z',
      status: 'completed',
      customerId: 'c1',
    },
  };

  function importedStop(propertyKey: string, routeId: string, overrides: Partial<HistoryStop> = {}): HistoryStop {
    return { ...stop(propertyKey, 'r1'), routeId, ...overrides };
  }

  function property(stops: HistoryStop[], filters = {}) {
    const result = build(stops, { routesById: IMPORTED, filters, search: { level: 'address', propertyKey: CLIFF_14 } });
    if (result.level !== 'address') throw new Error('expected address');
    return result.property;
  }

  const datesByRoute = (stops: HistoryStop[]) =>
    Object.fromEntries(property(stops)!.visits.map((visit) => [visit.routeId, visit.date]));

  it('dates a Visit by its Route start, else its placement start, else not at all', () => {
    const undated = { ...IMPORTED.undatedA, createdAt: '2026-09-18T04:00:00.000Z' } as HistoryRoute;
    const result = build([importedStop(CLIFF_14, 'started'), importedStop(CLIFF_14, 'placed'), importedStop(CLIFF_14, 'undatedA')], {
      routesById: { ...IMPORTED, undatedA: undated },
      search: { level: 'address', propertyKey: CLIFF_14 },
    });
    if (result.level !== 'address' || !result.property) throw new Error('expected a property');

    expect(Object.fromEntries(result.property.visits.map((visit) => [visit.routeId, visit.date]))).toEqual({
      started: '2025-06-10',
      placed: '2025-06-20',
      undatedA: null,
    });
  });

  it("keeps a Route's scheduledDate even when it started on another day", () => {
    expect(datesByRoute([importedStop(CLIFF_14, 'scheduledKept')])).toEqual({ scheduledKept: '2025-07-21' });
  });

  it('sorts dated Visits newest first, then undated ones by Route Code, newest first', () => {
    const p = property([
      importedStop(CLIFF_14, 'undatedA'),
      importedStop(CLIFF_14, 'started'),
      importedStop(CLIFF_14, 'undatedB'),
      importedStop(CLIFF_14, 'r1'),
      importedStop(CLIFF_14, 'placed'),
    ])!;

    expect(p.visits.map((visit) => visit.routeId)).toEqual(['r1', 'placed', 'started', 'undatedB', 'undatedA']);
  });

  it('sorts dated scheduled Visits soonest first, then undated ones', () => {
    const p = property([importedStop(CLIFF_14, 'undatedPlanned'), importedStop(CLIFF_14, 'r3'), importedStop(CLIFF_14, 'r4')])!;

    expect(p.scheduled.map((visit) => visit.routeId)).toEqual(['r4', 'r3', 'undatedPlanned']);
  });

  it('filters an imported Visit by the day its Route started, and leaves out undated ones', () => {
    const stops = [importedStop(CLIFF_14, 'started'), importedStop(CLIFF_14, 'undatedA'), importedStop(CLIFF_14, 'r1')];

    expect(property(stops, { dateFrom: '2025-06-01', dateTo: '2025-06-30' })!.visits.map((visit) => visit.routeId)).toEqual(['started']);
    expect(property(stops)!.visits).toHaveLength(3);
  });

  it("labels the Property with its latest Visit's address by Visit date", () => {
    const p = property([
      importedStop(CLIFF_14, 'placed', { address: '14 Cliff Road, Epping' }),
      importedStop(CLIFF_14, 'started', { address: '14 Cliff Rd (old)' }),
      importedStop(CLIFF_14, 'undatedA', { address: '14 Cliff (undated)' }),
    ])!;

    expect(p.address).toBe('14 Cliff Road, Epping');
  });
});
